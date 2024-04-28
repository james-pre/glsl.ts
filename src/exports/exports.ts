import { API_NAME } from '../core/api.js';
import { CompilerOptions, OutputFormat, RenameSymbols, compile1, typeCheck } from '../core/compiler.js';
import { TrailingNewline, format1 } from '../core/formatter.js';
import { Completion, CompletionQuery, RenameQuery, Signature, SignatureQuery, SymbolQuery, SymbolsQuery, Tooltip } from '../core/ide.js';
import { Diagnostic, DiagnosticKind, Log } from '../core/log.js';
import { Range } from '../core/range.js';
import { Source } from '../core/source.js';
import { _Symbol } from '../core/symbol.js';
import { Color, print, setColor, width, write } from '../lib/terminal.js';
import { __asString, string_slice12, StringMap_get11, StringMap_insert1, StringMap_get3 } from '../native-js.js';

export function printUsage(): void {
	console.log(
		"\nUsage: glslx [sources] [flags]\n\n  --output=PATH\n    Set the path to the output file. Defaults to standard out.\n\n  --format=FORMAT\n    Set the output format, must be json, js, c++, skew or rust. Defaults to json.\n\nAdvanced:\n\n  --disable-rewriting\n    Disable syntax tree rewriting, useful to check for driver bugs.\n\n  --pretty-print\n    Format the output nicely instead of minifying it.\n\n  --renaming=MODE\n    Valid modes are all, internal-only, or none. Defaults to all.\n\n  --keep-symbols\n    Don't inline constants or remove unused symbols.\n"
	);
}

export function printWithColor(color: Color, text: string): void {
	setColor(color);
	write(text);
	setColor(Color.DEFAULT);
}

export function printError(text: string): void {
	printWithColor(Color.RED, 'error: ');
	printWithColor(Color.BOLD, text + '\n');
}

export function printNote(text: string): void {
	printWithColor(Color.GRAY, 'note: ');
	printWithColor(Color.BOLD, text + '\n');
}

export function printWarning(text: string): void {
	printWithColor(Color.MAGENTA, 'warning: ');
	printWithColor(Color.BOLD, text + '\n');
}

export function printLogWithColor(log: Log): void {
	let terminalWidth = width();

	for (const diagnostic of log.diagnostics) {
		if (diagnostic.range !== null) {
			printWithColor(Color.BOLD, diagnostic.range.locationString() + ': ');
		}

		switch (diagnostic.kind) {
			case DiagnosticKind.WARNING: {
				printWarning(diagnostic.text);
				break;
			}

			case DiagnosticKind.ERROR: {
				printError(diagnostic.text);
				break;
			}
		}

		if (diagnostic.range !== null) {
			let formatted = diagnostic.range.format(terminalWidth);
			printWithColor(Color.GRAY, formatted.line + '\n');
			printWithColor(Color.GREEN, formatted.range + '\n');
		}

		if (diagnostic.noteRange !== null) {
			printWithColor(Color.BOLD, diagnostic.noteRange.locationString() + ': ');
			printNote(diagnostic.noteText);
			let formatted1 = diagnostic.noteRange.format(terminalWidth);
			printWithColor(Color.GRAY, formatted1.line + '\n');
			printWithColor(Color.GREEN, formatted1.range + '\n');
		}
	}

	// Print the summary
	let hasErrors = log.hasErrors();
	let hasWarnings = log.hasWarnings();
	let summary = '';

	if (hasWarnings) {
		summary += `${log.warningCount} warning${Log.plural(log.warningCount)}`;

		if (hasErrors) {
			summary += ' and ';
		}
	}

	if (hasErrors) {
		summary += `${log.errorCount} error${Log.plural(log.errorCount)}`;
	}

	if (hasWarnings || hasErrors) {
		print(summary + ' generated');
	}
}

export function sourcesFromInput(input: any): Array<Source> {
	if (typeof input === 'string') {
		return [new Source('<stdin>', input)];
	}

	if (input instanceof Array<any>) {
		let sources: Array<Source> = [];

		for (let i = 0, count: number = input.length; i < count; i = i + 1) {
			let item: any = input[i];
			sources.push(new Source(__asString(item.name), __asString(item.contents)));
		}

		return sources;
	}

	return [new Source(__asString(input.name), __asString(input.contents))];
}

export function wrapFileAccess(callback: any): (v0: string, v1: string) => Source {
	return (filePath: string, relativeTo: string) => {
		let result: any = callback(filePath, relativeTo);

		if (typeof result === 'string') {
			return new Source(filePath, result);
		}

		if (!result) {
			return null;
		}

		let name: any = result.name;
		let contents: any = result.contents;

		if (typeof name === 'string' && typeof contents === 'string') {
			return new Source(name, contents);
		}

		throw new Error('Invalid file access result');
	};
}

export function commandLineMain(): void {
	let args: Array<string> = process.argv.slice(2);
	let options = new CompilerOptions();
	let sources: Array<Source> = [];
	let outputFormat = OutputFormat.JSON;
	let outputPath: string = null;
	let fs: any = require('fs');
	let path: any = require('path');
	options.fileAccess = (filePath: string, relativeTo: string) => {
		let name: any = path.resolve(path.dirname(relativeTo), filePath);

		try {
			return new Source(name, fs.readFileSync(name, 'utf8'));
		} catch {}

		return null;
	};

	for (const arg of args) {
		if (!arg.startsWith('-')) {
			sources.push(new Source(path.resolve(arg), fs.readFileSync(arg, 'utf8')));
			continue;
		}

		let value = arg;

		if (value === '--disable-rewriting') {
			options.compactSyntaxTree = false;
		} else if (value === '--pretty-print') {
			options.removeWhitespace = false;
		} else if (value === '--keep-symbols') {
			options.trimSymbols = false;
		} else if (value === '--help' || value === '-h') {
			printUsage();
			return;
		} else if (arg.startsWith('--output=')) {
			outputPath = string_slice12(arg, '--output='.length);
		} else if (arg.startsWith('--format=')) {
			let text = string_slice12(arg, '--format='.length);

			if (!outputFormats.has(text)) {
				console.log(`invalid output format "${text}"`);
				process.exit(1);
			}

			outputFormat = StringMap_get11(outputFormats, text);
		} else if (arg.startsWith('--renaming=')) {
			let text1 = string_slice12(arg, '--renaming='.length);

			if (!renameSymbols.has(text1)) {
				console.log(`invalid symbol renaming mode "${text1}"`);
				process.exit(1);
			}

			options.renameSymbols = StringMap_get11(renameSymbols, text1);
		} else {
			console.log(`invalid flag "${arg}"`);
			process.exit(1);
		}
	}

	if (sources.length === 0) {
		printUsage();
		return;
	}

	let log = new Log();
	let result = compile1(log, sources, options);

	if (result !== null) {
		if (outputPath !== null) {
			fs.writeFileSync(outputPath, result.output(outputFormat));
			printLogWithColor(log);
		} else {
			process.stdout.write(result.output(outputFormat));
		}
	} else {
		printLogWithColor(log);
		process.exit(1);
	}
}

export function main(): void {
	let _this: any = (() => {
		return this;
	})();
	let root: any = typeof exports !== 'undefined' ? exports : (_this.GLSLX = {});

	// API exports
	root.compile = compile2;
	root.compileIDE = compileIDE;
	root.format = format2;

	// Also include a small command-line utility for when this is run in node
	if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
		commandLineMain();
	}
}

export let outputFormats = StringMap_insert1(
	StringMap_insert1(
		StringMap_insert1(StringMap_insert1(StringMap_insert1(new Map(), 'json', OutputFormat.JSON), 'js', OutputFormat.JS), 'c++', OutputFormat.CPP),
		'skew',
		OutputFormat.SKEW
	),
	'rust',
	OutputFormat.RUST
);
export let renameSymbols = StringMap_insert1(
	StringMap_insert1(StringMap_insert1(new Map(), 'all', RenameSymbols.ALL), 'internal-only', RenameSymbols.INTERNAL_ONLY),
	'none',
	RenameSymbols.NONE
);
export let rangeToJSON: (v0: Range) => any = (range: Range) => {
	if (range === null) {
		return null;
	}

	let source = range.source;
	let start = source.indexToLineColumn(range.start);
	let end = source.indexToLineColumn(range.end);
	return {
		source: source.name,
		start: {
			line: start.line,
			column: start.column,
		},
		end: {
			line: end.line,
			column: end.column,
		},
	};
};

// Do a non-interactive compile
export let compile2: (v0: any, v1: any) => any = (input: any, args: any) => {
	args = args || {};
	let sources = sourcesFromInput(input);
	let log = new Log();
	let options = new CompilerOptions();
	options.renameSymbols = StringMap_get3(renameSymbols, args.renaming, RenameSymbols.ALL);

	if (args.disableRewriting) {
		options.compactSyntaxTree = false;
	}

	if (args.prettyPrint) {
		options.removeWhitespace = false;
	}

	if (args.keepSymbols) {
		options.trimSymbols = false;
	}

	if (args.fileAccess) {
		options.fileAccess = wrapFileAccess(args.fileAccess);
	}

	let result = compile1(log, sources, options);
	return {
		log: log.toString(),
		output: result !== null ? result.output(StringMap_get3(outputFormats, args.format, OutputFormat.JSON)) : null,
	};
};

// Do a compile that can have queries done on it later
export let compileIDE: (v0: any, v1: any) => any = (input: any, args: any) => {
	args = args || {};
	let sources = sourcesFromInput(input);
	let log = new Log();
	let options = new CompilerOptions();

	if (args.fileAccess) {
		options.fileAccess = wrapFileAccess(args.fileAccess);
	}

	let result = typeCheck(log, sources, options);
	let handleTooltipQuery: (v0: any) => any = (message: any) => {
		let ref: _Symbol;
		let name: string = message.source + '';
		let line: number = message.line | 0;
		let column: number = message.column | 0;
		let ignoreDiagnostics: boolean = !!message.ignoreDiagnostics;
		let range: Range = null;
		let tooltip: Tooltip = null;
		let symbol: string = null;

		for (const source of sources) {
			if (source.name === name) {
				let index = source.lineColumnToIndex(line, column);

				if (index !== -1) {
					// Search diagnostics first
					if (!ignoreDiagnostics && log !== null) {
						for (const diagnostic of log.diagnostics) {
							if (diagnostic.range !== null && diagnostic.range.source === source && diagnostic.range.touches(index)) {
								tooltip = new Tooltip(diagnostic.text, '');
								range = diagnostic.range;
								break;
							}
						}
					}

					// Search the syntax tree next
					if (tooltip === null && result !== null) {
						let query = new SymbolQuery(source, index);
						query.run(result.global);
						tooltip = query.generateTooltip();

						if (tooltip !== null) {
							range = query.range;
							symbol = (ref = query.symbol) !== null ? ref.name : null;
						}
					}
				}

				break;
			}
		}

		return {
			tooltip: tooltip !== null ? tooltip.code : null,
			range: rangeToJSON(range),
			symbol: symbol,
			documentation: tooltip !== null ? tooltip.documentation : null,
		};
	};
	let handleDefinitionQuery: (v0: any) => any = (message: any) => {
		let name: string = message.source + '';
		let line: number = message.line | 0;
		let column: number = message.column | 0;
		let range: Range = null;
		let definition: Range = null;
		let symbol: string = null;

		// Allow go-to-definition on #include statements
		for (const include of result.includes) {
			if (include.originalRange.source.name === name) {
				let index = include.originalRange.source.lineColumnToIndex(line, column);

				if (index !== -1 && include.originalRange.touches(index)) {
					return {
						definition: rangeToJSON(include.includedRange),
						range: rangeToJSON(include.originalRange),
						symbol: include.includedRange.source.name,
					};
				}
			}
		}

		for (const source of sources) {
			if (source.name === name) {
				let index1 = source.lineColumnToIndex(line, column);

				if (index1 !== -1 && result !== null) {
					let query = new SymbolQuery(source, index1);
					query.run(result.global);

					if (query.symbol !== null && query.symbol.range !== null && query.symbol.range.source.name !== API_NAME) {
						definition = query.symbol.range;
						range = query.range;
						symbol = query.symbol.name;
					}
				}

				break;
			}
		}

		return {
			definition: rangeToJSON(definition),
			range: rangeToJSON(range),
			symbol: symbol,
		};
	};
	let handleSymbolsQuery: (v0: any) => any = (message: any) => {
		let name: string = message.source + '';
		let symbols: Array<any> = null;

		for (const source of sources) {
			if (source.name === name) {
				if (result !== null) {
					let query = new SymbolsQuery(source);
					query.run(result.global);
					symbols = query.symbols.map<any>((symbol: _Symbol) => {
						return {
							name: symbol.name,
							kind: symbol.isVariable() ? 'variable' : symbol.isFunction() ? 'function' : symbol.isStruct() ? 'struct' : null,
							range: rangeToJSON(symbol.range),
						};
					});
				}

				break;
			}
		}

		return {
			symbols: symbols,
		};
	};
	let handleRenameQuery: (v0: any) => any = (message: any) => {
		let name: string = message.source + '';
		let line: number = message.line | 0;
		let column: number = message.column | 0;
		let ranges: Array<any> = null;
		let symbol: string = null;

		for (const source of sources) {
			if (source.name === name) {
				let index = source.lineColumnToIndex(line, column);

				if (index !== -1 && result !== null) {
					let renameQuery = new RenameQuery(source, index);
					renameQuery.run(result.global);

					if (renameQuery.symbol !== null && renameQuery.symbol.range !== null && renameQuery.symbol.range.source.name !== API_NAME) {
						ranges = renameQuery.ranges.map<any>(rangeToJSON);
						symbol = renameQuery.symbol.name;
					}
				}

				break;
			}
		}

		return {
			ranges: ranges,
			symbol: symbol,
		};
	};
	let handleCompletionQuery: (v0: any) => any = (message: any) => {
		let name: string = message.source + '';
		let line: number = message.line | 0;
		let column: number = message.column | 0;
		let completions: Array<any> = [];

		for (const source of sources) {
			if (source.name === name) {
				let index = source.lineColumnToIndex(line, column);

				if (index !== -1 && result !== null) {
					let completionQuery = new CompletionQuery(source, index);
					completionQuery.run(result.global);
					completions = completionQuery.completions.map<any>((completion: Completion) => {
						return {
							kind: completion.kind,
							name: completion.name,
							detail: completion.detail,
							documentation: completion.documentation,
						};
					});
				}
			}
		}

		return {
			completions: completions,
		};
	};
	let handleSignatureQuery: (v0: any) => any = (message: any) => {
		let name: string = message.source + '';
		let line: number = message.line | 0;
		let column: number = message.column | 0;
		let signatures: Array<any> = [];
		let activeArgument = -1;
		let activeSignature = -1;

		for (const source of sources) {
			if (source.name === name) {
				let index = source.lineColumnToIndex(line, column);

				if (index !== -1 && result !== null) {
					let signatureQuery = new SignatureQuery(source, index);
					signatureQuery.run(result.global);
					activeArgument = signatureQuery.activeArgument;
					activeSignature = signatureQuery.activeSignature;
					signatures = signatureQuery.signatures.map<any>((signature: Signature) => {
						return {
							text: signature.text,
							arguments: signature._arguments,
							documentation: signature.documentation,
						};
					});
				}
			}
		}

		return {
			signatures: signatures,
			activeArgument: activeArgument,
			activeSignature: activeSignature,
		};
	};
	return {
		unusedSymbols: log.unusedSymbols.map<any>((symbol: _Symbol) => {
			return {
				name: symbol.name,
				range: rangeToJSON(symbol.range),
			};
		}),
		diagnostics: log.diagnostics.map<any>((diagnostic: Diagnostic) => {
			return {
				kind: DiagnosticKind[diagnostic.kind].toLowerCase(),
				range: rangeToJSON(diagnostic.range),
				text: diagnostic.text,
			};
		}),
		tooltipQuery: handleTooltipQuery,
		definitionQuery: handleDefinitionQuery,
		symbolsQuery: handleSymbolsQuery,
		renameQuery: handleRenameQuery,
		completionQuery: handleCompletionQuery,
		signatureQuery: handleSignatureQuery,
	};
};

// Source code formatting
export let format2: (v0: any, v1: any) => string = (input: any, options: any) => {
	options = options || {};
	let indent = 'indent' in options ? __asString(options.indent) : '  ';
	let newline = 'newline' in options ? __asString(options.newline) : '\n';
	let trailingNewline = TrailingNewline.INSERT;

	if ('trailingNewline' in options) {
		let value = __asString(options.trailingNewline);
		let value1 = value;

		if (value1 === 'preserve') {
			trailingNewline = TrailingNewline.PRESERVE;
		} else if (value1 === 'remove') {
			trailingNewline = TrailingNewline.REMOVE;
		} else if (value1 === 'insert') {
			trailingNewline = TrailingNewline.INSERT;
		} else {
			throw new Error(`Invalid "trailingNewline" value: ${value}`);
		}
	}

	return format1(__asString(input), indent, newline, trailingNewline);
};
