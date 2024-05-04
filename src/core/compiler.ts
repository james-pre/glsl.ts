import { assert } from 'console';
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

export const enum OutputFormat {
	JSON,
	JS,
	CPP,
	SKEW,
	RUST,
}

export const enum RenameSymbols {
	ALL,
	INTERNAL,
	NONE,
}

export class CompilerOptions {
	compactSyntaxTree: boolean;
	removeWhitespace: boolean;
	renameSymbols: RenameSymbols;
	trimSymbols: boolean;
	fileAccess: (v0: string, v1: string) => Source;

	constructor() {
		this.compactSyntaxTree = true;
		this.removeWhitespace = true;
		this.renameSymbols = RenameSymbols.ALL;
		this.trimSymbols = true;
		this.fileAccess = null;
	}
}

export const enum ExtensionBehavior {
	DEFAULT,
	DISABLE,
	ENABLE,
	REQUIRE,
	WARN,
}

export class CompilerData {
	currentExtensions: Map<string, ExtensionBehavior>;
	fileAccess: (v0: string, v1: string) => Source;
	_nextSymbolID: number;

	nextSymbolID(): number {
		this._nextSymbolID = this._nextSymbolID + 1;
		return this._nextSymbolID;
	}

	extensionBehavior(name: string): ExtensionBehavior {
		return this.currentExtensions.get(name) ?? ExtensionBehavior.DEFAULT;
	}

	constructor(fileAccess: (v0: string, v1: string) => Source) {
		this.currentExtensions = new Map();
		this.fileAccess = fileAccess;
		this._nextSymbolID = 0;
	}
}

export class CompilerResult {
	shaders: Array<Source>;
	renaming: Map<string, string>;

	output(format: OutputFormat): string {
		switch (format) {
			case OutputFormat.JSON: {
				const map: any = {};
				Array.from(this.renaming.keys()).forEach((key: string) => {
					assert(this.renaming.has(key));
					map[key] = this.renaming.get(key);
				});
				return (
					JSON.stringify(
						{
							shaders:
								this.shaders === null
									? null
									: this.shaders.map<any>((source: Source) => {
											return {
												name: source.name,
												contents: source.contents,
											};
										}),
							renaming: map,
						},
						null,
						2
					) + '\n'
				);
			}

			case OutputFormat.JS: {
				if (this.shaders !== null) {
					let code = '';

					for (const shader of this.shaders) {
						code += `export const GLSLX_SOURCE_${this._transformName(shader.name)} = ${JSON.stringify(shader.contents)}\n`;
					}

					if (this.renaming !== null && !(Array.from(this.renaming.keys()).length === 0)) {
						code += '\n';

						for (const name of Array.from(this.renaming.keys())) {
							assert(this.renaming.has(name));
							code += `export const GLSLX_NAME_${this._transformName(name)} = ${JSON.stringify(this.renaming.get(name))}\n`;
						}
					}

					return code;
				}
				break;
			}

			case OutputFormat.CPP: {
				if (this.shaders !== null) {
					let code = '';
					code += '#ifndef GLSLX_STRINGS_H\n';
					code += '#define GLSLX_STRINGS_H\n';
					code += '\n';

					for (const shader of this.shaders) {
						code += `static const char *GLSLX_SOURCE_${this._transformName(shader.name)} = ${JSON.stringify(shader.contents)};\n`;
					}

					code += '\n';

					if (this.renaming !== null) {
						for (const name of Array.from(this.renaming.keys())) {
							assert(this.renaming.has(name));
							code += `static const char *GLSLX_NAME_${this._transformName(name)} = ${JSON.stringify(this.renaming.get(name))};\n`;
						}

						code += '\n';
					}

					code += '#endif\n';
					return code;
				}
				break;
			}

			case OutputFormat.SKEW: {
				if (this.shaders !== null) {
					let code = '';

					for (const shader of this.shaders) {
						code += `const GLSLX_SOURCE_${this._transformName(shader.name)} = ${JSON.stringify(shader.contents)}\n`;
					}

					if (this.renaming !== null && !(Array.from(this.renaming.keys()).length === 0)) {
						code += '\n';

						for (const name of Array.from(this.renaming.keys())) {
							assert(this.renaming.has(name));
							code += `const GLSLX_NAME_${this._transformName(name)} = ${JSON.stringify(this.renaming.get(name))}\n`;
						}
					}

					return code;
				}
				break;
			}

			case OutputFormat.RUST: {
				if (this.shaders !== null) {
					let code = '';

					for (const shader of this.shaders) {
						code += `pub static GLSLX_SOURCE_${this._transformName(shader.name)}: &str = ${JSON.stringify(shader.contents)};\n`;
					}

					if (this.renaming !== null && !(Array.from(this.renaming.keys()).length === 0)) {
						code += '\n';

						for (const name of Array.from(this.renaming.keys())) {
							assert(this.renaming.has(name));
							code += `pub static GLSLX_NAME_${this._transformName(name)}: &str = ${JSON.stringify(this.renaming.get(name))};\n`;
						}
					}

					return code;
				}
				break;
			}
		}

		return null;
	}

	_transformName(name: string): string {
		return name.replace(new RegExp('([a-z0-9])([A-Z])', 'g'), '$1_$2').toUpperCase();
	}

	constructor(shaders: Array<Source>, renaming: Map<string, string>) {
		this.shaders = shaders;
		this.renaming = renaming;
	}
}

export class TypeCheckResult {
	global: Node;
	includes: Array<Include>;

	constructor(global: Node, includes: Array<Include>) {
		this.global = global;
		this.includes = includes;
	}
}

export function typeCheck(log: Log, sources: Array<Source>, options: CompilerOptions): TypeCheckResult {
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
	const includes: Include[] = [];

	for (const source of sources) {
		const result = parse(log, source.tokens, global, data, scope, resolver);
		includes.push(...result.includes);
	}

	// Then run type checking
	resolver.resolveGlobal(global);

	// Always return even when there were errors since the partial result is still useful
	return new TypeCheckResult(global, includes);
}

export function compile1(log: Log, sources: Array<Source>, options: CompilerOptions): CompilerResult {
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
	for (const source1 of sources) {
		parse(log, source1.tokens, global, data, scope, resolver);
	}

	// Then run type checking
	resolver.resolveGlobal(global);

	if (log.hasErrors()) {
		return null;
	}

	// Multiple export mode is more complicated. Everything is already compiled,
	// and in theory we could quickly export all shaders from that, but in
	// practice it's simpler if the source code is just compiled over again once
	// per shader.
	const names: Array<string> = [];
	const globals: Array<Node> = [];

	for (const root of _collectAllExportedFunctions(scope)) {
		const shaderGlobal = Node.createGlobal();
		const shaderScope = new Scope(ScopeKind.GLOBAL, null);
		const shaderData = new CompilerData(options.fileAccess);
		const shaderLog = new Log();
		const shaderResolver = new Resolver(shaderLog, shaderData);

		// Parse everything again
		for (const source2 of sources) {
			parse(shaderLog, source2.tokens, shaderGlobal, shaderData, shaderScope, shaderResolver);
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
	const shaders: Array<Source> = [];
	const renaming = Renamer.rename(globals, options);

	for (let i = 0; i < names.length; i++) {
		shaders.push(new Source(names[i], Emitter.emit(globals[i], options)));
	}

	return new CompilerResult(shaders, renaming);
}

export function _collectAllExportedFunctions(scope: Scope): Array<FunctionSymbol> {
	const symbols: Array<FunctionSymbol> = [];

	for (const symbol of Array.from(scope.symbols.values())) {
		if (symbol.isFunction() && symbol.isExported()) {
			symbols.push(symbol.asFunction());
		}
	}

	return symbols;
}

export function _unexportAllFunctionsExcept(scope: Scope, _function: FunctionSymbol): void {
	for (const symbol of Array.from(scope.symbols.values())) {
		if (symbol.id !== _function.id) {
			symbol.flags &= ~SymbolFlags.EXPORTED;
		} else {
			symbol.name = 'main';
			const sibling = symbol.asFunction().sibling;

			if (sibling !== null) {
				sibling.name = symbol.name;
			}
		}
	}
}
