import { StringMap_get3, StringMap_get11, List_append2, List_get2 } from '../native-js.js';
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
		return StringMap_get3(this.currentExtensions, name, ExtensionBehavior.DEFAULT);
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
				let map: any = {};
				Array.from(this.renaming.keys()).forEach((key: string) => {
					map[key] = StringMap_get11(this.renaming, key);
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
							code += `export const GLSLX_NAME_${this._transformName(name)} = ${JSON.stringify(StringMap_get11(this.renaming, name))}\n`;
						}
					}

					return code;
				}
				break;
			}

			case OutputFormat.CPP: {
				if (this.shaders !== null) {
					let code1 = '';
					code1 += '#ifndef GLSLX_STRINGS_H\n';
					code1 += '#define GLSLX_STRINGS_H\n';
					code1 += '\n';

					for (const shader1 of this.shaders) {
						code1 += `static const char *GLSLX_SOURCE_${this._transformName(shader1.name)} = ${JSON.stringify(shader1.contents)};\n`;
					}

					code1 += '\n';

					if (this.renaming !== null) {
						for (const name1 of Array.from(this.renaming.keys())) {
							code1 += `static const char *GLSLX_NAME_${this._transformName(name1)} = ${JSON.stringify(StringMap_get11(this.renaming, name1))};\n`;
						}

						code1 += '\n';
					}

					code1 += '#endif\n';
					return code1;
				}
				break;
			}

			case OutputFormat.SKEW: {
				if (this.shaders !== null) {
					let code2 = '';

					for (const shader2 of this.shaders) {
						code2 += `const GLSLX_SOURCE_${this._transformName(shader2.name)} = ${JSON.stringify(shader2.contents)}\n`;
					}

					if (this.renaming !== null && !(Array.from(this.renaming.keys()).length === 0)) {
						code2 += '\n';

						for (const name2 of Array.from(this.renaming.keys())) {
							code2 += `const GLSLX_NAME_${this._transformName(name2)} = ${JSON.stringify(StringMap_get11(this.renaming, name2))}\n`;
						}
					}

					return code2;
				}
				break;
			}

			case OutputFormat.RUST: {
				if (this.shaders !== null) {
					let code3 = '';

					for (const shader3 of this.shaders) {
						code3 += `pub static GLSLX_SOURCE_${this._transformName(shader3.name)}: &str = ${JSON.stringify(shader3.contents)};\n`;
					}

					if (this.renaming !== null && !(Array.from(this.renaming.keys()).length === 0)) {
						code3 += '\n';

						for (const name3 of Array.from(this.renaming.keys())) {
							code3 += `pub static GLSLX_NAME_${this._transformName(name3)}: &str = ${JSON.stringify(StringMap_get11(this.renaming, name3))};\n`;
						}
					}

					return code3;
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

	let global = Node.createGlobal();
	let scope = new Scope(ScopeKind.GLOBAL, null);
	let data = new CompilerData(options.fileAccess);
	let resolver = new Resolver(log, data);

	// Parse everything next
	let includes: Array<Include> = [];

	for (const source1 of sources) {
		let result = parse(log, source1.tokens, global, data, scope, resolver);
		List_append2(includes, result.includes);
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

	let global = Node.createGlobal();
	let scope = new Scope(ScopeKind.GLOBAL, null);
	let data = new CompilerData(options.fileAccess);
	let resolver = new Resolver(log, data);

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
	let names: Array<string> = [];
	let globals: Array<Node> = [];

	for (const root of _collectAllExportedFunctions(scope)) {
		let shaderGlobal = Node.createGlobal();
		let shaderScope = new Scope(ScopeKind.GLOBAL, null);
		let shaderData = new CompilerData(options.fileAccess);
		let shaderLog = new Log();
		let shaderResolver = new Resolver(shaderLog, shaderData);

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
	let shaders: Array<Source> = [];
	let renaming = Renamer.rename(globals, options);

	for (let i = 0, count = names.length; i < count; i = i + 1) {
		shaders.push(new Source(List_get2(names, i), Emitter.emit(List_get2(globals, i), options)));
	}

	return new CompilerResult(shaders, renaming);
}

export function _collectAllExportedFunctions(scope: Scope): Array<FunctionSymbol> {
	let symbols: Array<FunctionSymbol> = [];

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
			let sibling = symbol.asFunction().sibling;

			if (sibling !== null) {
				sibling.name = symbol.name;
			}
		}
	}
}
