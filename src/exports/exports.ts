import { API_NAME } from '../core/api.js';
import { CompilerOptions, OutputFormat, RenameSymbols, compile1, typeCheck } from '../core/compiler.js';
import { TrailingNewline, format1 } from '../core/formatter.js';
import { Completion, CompletionQuery, RenameQuery, Signature, SignatureQuery, SymbolQuery, SymbolsQuery, Tooltip } from '../core/ide.js';
import { Diagnostic, DiagnosticKind, Log } from '../core/log.js';
import { Range } from '../core/range.js';
import { Source } from '../core/source.js';
import { _Symbol } from '../core/symbol.js';
import { Color, print, setColor, width, write } from '../lib/terminal.js';

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
	const terminalWidth = width();

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
			const formatted = diagnostic.range.format(terminalWidth);
			printWithColor(Color.GRAY, formatted.line + '\n');
			printWithColor(Color.GREEN, formatted.range + '\n');
		}

		if (diagnostic.noteRange !== null) {
			printWithColor(Color.BOLD, diagnostic.noteRange.locationString() + ': ');
			printNote(diagnostic.noteText);
			const formatted1 = diagnostic.noteRange.format(terminalWidth);
			printWithColor(Color.GRAY, formatted1.line + '\n');
			printWithColor(Color.GREEN, formatted1.range + '\n');
		}
	}

	// Print the summary
	const hasErrors = log.hasErrors();
	const hasWarnings = log.hasWarnings();
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
		const sources: Array<Source> = [];

		for (let i = 0, count: number = input.length; i < count; i++) {
			const item: any = input[i];
			sources.push(new Source(item.name?.toString(), item.contents?.toString()));
		}

		return sources;
	}

	return [new Source(input.name?.toString(), input.contents?.toString())];
}

export function wrapFileAccess(callback: any): (v0: string, v1: string) => Source {
	return (filePath: string, relativeTo: string) => {
		const result: any = callback(filePath, relativeTo);

		if (typeof result === 'string') {
			return new Source(filePath, result);
		}

		if (!result) {
			return null;
		}

		const name: any = result.name;
		const contents: any = result.contents;

		if (typeof name === 'string' && typeof contents === 'string') {
			return new Source(name, contents);
		}

		throw new Error('Invalid file access result');
	};
}

export function commandLineMain(): void {
	const args: Array<string> = process.argv.slice(2);
	const options = new CompilerOptions();
	const sources: Array<Source> = [];
	let outputFormat = OutputFormat.JSON;
	let outputPath: string = null;
	const fs: any = require('fs');
	const path: any = require('path');
	options.fileAccess = (filePath: string, relativeTo: string) => {
		const name: any = path.resolve(path.dirname(relativeTo), filePath);

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

		const value = arg;

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
			outputPath = arg.slice('--output='.length);
		} else if (arg.startsWith('--format=')) {
			const text = arg.slice('--format='.length);

			if (!outputFormats.has(text)) {
				console.log(`invalid output format "${text}"`);
				process.exit(1);
			}

			outputFormat = outputFormats.get(text);
		} else if (arg.startsWith('--renaming=')) {
			const text1 = arg.slice('--renaming='.length);

			if (!renameSymbols.has(text1)) {
				console.log(`invalid symbol renaming mode "${text1}"`);
				process.exit(1);
			}

			options.renameSymbols = renameSymbols.get(text1);
		} else {
			console.log(`invalid flag "${arg}"`);
			process.exit(1);
		}
	}

	if (sources.length === 0) {
		printUsage();
		return;
	}

	const log = new Log();
	const result = compile1(log, sources, options);

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
	const _this: any = (() => {
		return this;
	})();
	const root: any = typeof exports !== 'undefined' ? exports : (_this.GLSLX = {});

	// API exports
	root.compile = compile2;
	root.compileIDE = compileIDE;
	root.format = format2;

	// Also include a small command-line utility for when this is run in node
	if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
		commandLineMain();
	}
}

export const outputFormats = new Map();
outputFormats.set('json', OutputFormat.JSON);
outputFormats.set('js', OutputFormat.JS);
outputFormats.set('c++', OutputFormat.CPP);
outputFormats.set('skew', OutputFormat.SKEW);
outputFormats.set('rust', OutputFormat.RUST);

export const renameSymbols = new Map();
renameSymbols.set('all', RenameSymbols.ALL);
renameSymbols.set('internal-only', RenameSymbols.INTERNAL);
renameSymbols.set('none', RenameSymbols.NONE);

export const rangeToJSON: (v0: Range) => any = (range: Range) => {
	if (range === null) {
		return null;
	}

	const source = range.source;
	const start = source.indexToLineColumn(range.start);
	const end = source.indexToLineColumn(range.end);
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
export const compile2: (v0: any, v1: any) => any = (input: any, args: any) => {
	args = args || {};
	const sources = sourcesFromInput(input);
	const log = new Log();
	const options = new CompilerOptions();
	options.renameSymbols = renameSymbols.get(args.renaming) ?? RenameSymbols.ALL;

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

	const result = compile1(log, sources, options);
	return {
		log: log.toString(),
		output: result !== null ? result.output(outputFormats.get(args.format) ?? OutputFormat.JSON) : null,
	};
};

// Do a compile that can have queries done on it later
export const compileIDE: (v0: any, v1: any) => any = (input: any, args: any) => {
	args = args || {};
	const sources = sourcesFromInput(input);
	const log = new Log();
	const options = new CompilerOptions();

	if (args.fileAccess) {
		options.fileAccess = wrapFileAccess(args.fileAccess);
	}

	const result = typeCheck(log, sources, options);
	const handleTooltipQuery: (v0: any) => any = (message: any) => {
		let ref: _Symbol;
		const name: string = message.source + '';
		const line: number = message.line | 0;
		const column: number = message.column | 0;
		const ignoreDiagnostics: boolean = !!message.ignoreDiagnostics;
		let range: Range = null;
		let tooltip: Tooltip = null;
		let symbol: string = null;

		for (const source of sources) {
			if (source.name === name) {
				const index = source.lineColumnToIndex(line, column);

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
						const query = new SymbolQuery(source, index);
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
	const handleDefinitionQuery: (v0: any) => any = (message: any) => {
		const name: string = message.source + '';
		const line: number = message.line | 0;
		const column: number = message.column | 0;
		let range: Range = null;
		let definition: Range = null;
		let symbol: string = null;

		// Allow go-to-definition on #include statements
		for (const include of result.includes) {
			if (include.originalRange.source.name === name) {
				const index = include.originalRange.source.lineColumnToIndex(line, column);

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
				const index1 = source.lineColumnToIndex(line, column);

				if (index1 !== -1 && result !== null) {
					const query = new SymbolQuery(source, index1);
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
	const handleSymbolsQuery: (v0: any) => any = (message: any) => {
		const name: string = message.source + '';
		let symbols: Array<any> = null;

		for (const source of sources) {
			if (source.name === name) {
				if (result !== null) {
					const query = new SymbolsQuery(source);
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
	const handleRenameQuery: (v0: any) => any = (message: any) => {
		const name: string = message.source + '';
		const line: number = message.line | 0;
		const column: number = message.column | 0;
		let ranges: Array<any> = null;
		let symbol: string = null;

		for (const source of sources) {
			if (source.name === name) {
				const index = source.lineColumnToIndex(line, column);

				if (index !== -1 && result !== null) {
					const renameQuery = new RenameQuery(source, index);
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
	const handleCompletionQuery: (v0: any) => any = (message: any) => {
		const name: string = message.source + '';
		const line: number = message.line | 0;
		const column: number = message.column | 0;
		let completions: Array<any> = [];

		for (const source of sources) {
			if (source.name === name) {
				const index = source.lineColumnToIndex(line, column);

				if (index !== -1 && result !== null) {
					const completionQuery = new CompletionQuery(source, index);
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
	const handleSignatureQuery: (v0: any) => any = (message: any) => {
		const name: string = message.source + '';
		const line: number = message.line | 0;
		const column: number = message.column | 0;
		let signatures: Array<any> = [];
		let activeArgument = -1;
		let activeSignature = -1;

		for (const source of sources) {
			if (source.name === name) {
				const index = source.lineColumnToIndex(line, column);

				if (index !== -1 && result !== null) {
					const signatureQuery = new SignatureQuery(source, index);
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
export const format2: (v0: any, v1: any) => string = (input: any, options: any) => {
	options = options || {};
	const indent = 'indent' in options ? options.indent?.toString() : '  ';
	const newline = 'newline' in options ? options.newline?.toString() : '\n';
	let trailingNewline = TrailingNewline.INSERT;

	if ('trailingNewline' in options) {
		const value = options.trailingNewline?.toString();
		const value1 = value;

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

	return format1(input?.toString(), indent, newline, trailingNewline);
};
