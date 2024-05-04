import { pick } from 'utilium';
import { API, API_NAME } from './api.js';
import { Emitter } from './emitter.js';
import { Log } from './log.js';
import { Node } from './node.js';
import { parse } from './parser.js';
import { Include } from './pratt.js';
import { Renamer } from './renamer.js';
import { Resolver } from './resolver.js';
import { Rewriter } from './rewriter.js';
import { Scope, ScopeKind } from './scope.js';
import { Source } from './source.js';
import { FunctionSymbol, SymbolFlags } from './symbol.js';
import { TokenPurpose, tokenize } from './tokenizer.js';

export type OutputFormat = 'json' | 'js' | 'c++' | 'skew' | 'rust';

export function isOutputFormat(arg: string): arg is OutputFormat {
	return ['json', 'js', 'c++', 'skew', 'rust'].includes(arg);
}

export type RenameSymbols = 'all' | 'internal-only' | 'none';

export function isRenameSymbols(arg: string): arg is RenameSymbols {
	return ['all', 'internal-only', 'none'].includes(arg);
}

export type FileAccess = (v0: string, v1: string) => Source;

export interface CompilerOptions {
	disableRewriting: boolean;
	keepWhitespace: boolean;
	renamingSymbols: RenameSymbols;
	trimSymbols: boolean;
	fileAccess?: FileAccess;
}

export const enum ExtensionBehavior {
	DEFAULT,
	DISABLE,
	ENABLE,
	REQUIRE,
	WARN,
}

export class CompilerData {
	public currentExtensions: Map<string, ExtensionBehavior> = new Map();
	protected _nextSymbolID: number = 0;

	public nextSymbolID(): number {
		this._nextSymbolID = this._nextSymbolID + 1;
		return this._nextSymbolID;
	}

	public extensionBehavior(name: string): ExtensionBehavior {
		return this.currentExtensions.get(name) ?? ExtensionBehavior.DEFAULT;
	}

	public constructor(public fileAccess: FileAccess) {}
}

export class CompilerResult {
	public constructor(
		public shaders: Source[],
		public renaming: Map<string, string>
	) {}

	protected _transformName(name: string): string {
		return name.replace(new RegExp('([a-z0-9])([A-Z])', 'g'), '$1_$2').toUpperCase();
	}

	public output(format: OutputFormat): string {
		if (format == 'json') {
			const shaders = !this.shaders ? null : this.shaders.map((source: Source) => pick(source, 'name', 'contents'));
			return JSON.stringify({ shaders, renaming: Object.fromEntries(this.renaming) }, null, 2) + '\n';
		}

		if (!this.shaders) {
			return null;
		}

		let code = '';

		if (format == 'c++') {
			code += '#ifndef GLSLX_STRINGS_H\n#define GLSLX_STRINGS_H\n\n';
		}

		const prefix = {
			js: 'export const',
			'c++': 'static const char *',
			skew: 'const',
			rust: 'pub static',
		} satisfies Record<Exclude<OutputFormat, 'json'>, string>;

		for (const shader of this.shaders) {
			code += `${prefix} GLSLX_SOURCE_${this._transformName(shader.name)}${format == 'rust' ? ': &str' : ''} = ${JSON.stringify(shader.contents)}${format == 'skew' ? '' : ';'}\n`;
		}

		code += '\n';

		if (this.renaming) {
			for (const [name, value] of this.renaming) {
				code += `${prefix} GLSLX_NAME_${this._transformName(name)}${format == 'rust' ? ': &str' : ''} = ${JSON.stringify(value)}${format == 'skew' ? '' : ';'}\n`;
			}
		}

		if (format == 'c++') {
			code += '#endif\n';
		}
		return code;
	}
}

export interface TypeCheckResult {
	global: Node;
	includes: Include[];
}

export function typeCheck(log: Log, sources: Source[], fileAccess: FileAccess): TypeCheckResult {
	if (log.hasErrors()) {
		return null;
	}

	// Generate tokens once
	sources.unshift(new Source(API_NAME, API));

	for (const source of sources) {
		source.tokens = tokenize(log, source, TokenPurpose.COMPILE);
	}

	const global = Node.createGlobal();
	const scope = new Scope(ScopeKind.GLOBAL, null);
	const data = new CompilerData(fileAccess);
	const resolver = new Resolver(log, data);

	// Parse everything next
	const includes: Include[] = [];

	for (const source of sources) {
		const result = parse(log, source.tokens, global, data, scope, resolver);
		includes.push(...result.includes);
	}

	// Then run type checking
	resolver.resolveGlobal(global);

	// Always return even when there were errors since the partial result is still useful
	return { global, includes };
}

export function compile(log: Log, sources: Source[], options: CompilerOptions): CompilerResult {
	if (log.hasErrors()) {
		return null;
	}

	// Generate tokens once
	sources.unshift(new Source(API_NAME, API));

	for (const source of sources) {
		source.tokens = tokenize(log, source, TokenPurpose.COMPILE);
	}

	const global = Node.createGlobal();
	const scope = new Scope(ScopeKind.GLOBAL, null);
	const data = new CompilerData(options.fileAccess);
	const resolver = new Resolver(log, data);

	// Parse everything next
	for (const source of sources) {
		parse(log, source.tokens, global, data, scope, resolver);
	}

	// Then run type checking
	resolver.resolveGlobal(global);

	if (log.hasErrors()) {
		return;
	}

	/* 
		Multiple export mode is more complicated. Everything is already compiled,
		and in theory we could quickly export all shaders from that, but in practice
		it's simpler if the source code is just compiled over again once per shader.
	*/
	const names: string[] = [];
	const globals: Node[] = [];

	for (const root of _collectAllExportedFunctions(scope)) {
		const shaderGlobal = Node.createGlobal();
		const shaderScope = new Scope(ScopeKind.GLOBAL, null);
		const shaderData = new CompilerData(options.fileAccess);
		const shaderLog = new Log();
		const shaderResolver = new Resolver(shaderLog, shaderData);

		// Parse everything again
		for (const source of sources) {
			parse(shaderLog, source.tokens, shaderGlobal, shaderData, shaderScope, shaderResolver);
		}

		// Flow types through the tree
		shaderResolver.resolveGlobal(shaderGlobal);

		// Optimize it and trim it down
		_unexportAllFunctionsExcept(shaderScope, root);
		Rewriter.rewrite(shaderGlobal, shaderData, options);
		globals.push(shaderGlobal);
		names.push(root.name);
	}

	// Rename everything together
	const shaders: Source[] = [];
	const renaming = Renamer.rename(globals, options);

	for (let i = 0; i < names.length; i++) {
		shaders.push(new Source(names[i], Emitter.emit(globals[i], options)));
	}

	return new CompilerResult(shaders, renaming);
}

export function _collectAllExportedFunctions(scope: Scope): FunctionSymbol[] {
	const symbols: FunctionSymbol[] = [];

	for (const symbol of scope.symbols.values()) {
		if (symbol.isFunction() && symbol.isExported()) {
			symbols.push(symbol.asFunction());
		}
	}

	return symbols;
}

export function _unexportAllFunctionsExcept(scope: Scope, _function: FunctionSymbol): void {
	for (const symbol of scope.symbols.values()) {
		if (symbol.id != _function.id) {
			symbol.flags &= ~SymbolFlags.EXPORTED;
		} else {
			symbol.name = 'main';
			const sibling = symbol.asFunction().sibling;

			if (sibling) {
				sibling.name = symbol.name;
			}
		}
	}
}
