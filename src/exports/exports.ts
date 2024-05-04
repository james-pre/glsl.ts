import * as fs from 'node:fs';
import * as path from 'node:path';
import { assignWithDefaults, pick } from 'utilium';
import { API_NAME } from '../core/api.js';
import { compile as _compile, CompilerOptions, FileAccess, isOutputFormat, isRenameSymbols, OutputFormat, RenameSymbols, typeCheck } from '../core/compiler.js';
import { format as _format, TrailingNewline } from '../core/formatter.js';
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

export function sourcesFromInput(input: any): Source[] {
	if (typeof input === 'string') {
		return [new Source('<stdin>', input)];
	}

	if (input instanceof Array) {
		const sources: Source[] = [];

		for (let i = 0; i < input.length; i++) {
			const item = input[i];
			sources.push(new Source(item.name?.toString(), item.contents?.toString()));
		}

		return sources;
	}

	return [new Source(input.name?.toString(), input.contents?.toString())];
}

export function wrapFileAccess(callback: any): FileAccess {
	return (filePath: string, relativeTo: string) => {
		const result = callback(filePath, relativeTo);

		if (typeof result === 'string') {
			return new Source(filePath, result);
		}

		if (!result) {
			return null;
		}

		const name = result.name;
		const contents = result.contents;

		if (typeof name === 'string' && typeof contents === 'string') {
			return new Source(name, contents);
		}

		throw new Error('Invalid file access result');
	};
}

export function commandLineMain(): void {
	const args: string[] = process.argv.slice(2);
	const options: CompilerOptions = {
		fileAccess(filePath: string, relativeTo: string) {
			const name = path.resolve(path.dirname(relativeTo), filePath);

			try {
				return new Source(name, fs.readFileSync(name, 'utf8'));
			} catch {
				return null;
			}
		},
		renamingSymbols: 'all',
		disableRewriting: false,
		keepWhitespace: false,
		trimSymbols: false,
	};
	const sources: Source[] = [];
	let outputFormat: OutputFormat = 'json';
	let outputPath: string = null;

	for (const arg of args) {
		if (!arg.startsWith('-')) {
			sources.push(new Source(path.resolve(arg), fs.readFileSync(arg, 'utf8')));
			continue;
		}

		const value = arg;

		if (value === '--disable-rewriting') {
			options.disableRewriting = true;
		} else if (value === '--pretty-print') {
			options.keepWhitespace = true;
		} else if (value === '--keep-symbols') {
			options.trimSymbols = false;
		} else if (value === '--help' || value === '-h') {
			printUsage();
			return;
		} else if (arg.startsWith('--output=')) {
			outputPath = arg.slice('--output='.length);
		} else if (arg.startsWith('--format=')) {
			const format = arg.slice('--format='.length);

			if (!isOutputFormat(format)) {
				console.log(`invalid output format "${format}"`);
				process.exit(1);
			}

			outputFormat = format;
		} else if (arg.startsWith('--renaming=')) {
			const renaming = arg.slice('--renaming='.length);

			if (!isRenameSymbols(renaming)) {
				console.log(`invalid symbol renaming mode "${renaming}"`);
				process.exit(1);
			}

			options.renamingSymbols = renaming;
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
	const result = _compile(log, sources, options);

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
	// Also include a small command-line utility for when this is run in node
	if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
		commandLineMain();
	}
}

export const _outputFormats = new Set<OutputFormat>(['json', 'js', 'c++', 'skew', 'rust']);

export const _renameSymbols = new Set<RenameSymbols>(['all', 'internal-only', 'none']);

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
export function compile(input: any, options: Partial<CompilerOptions & { format: OutputFormat }> = {}): any {
	const sources = sourcesFromInput(input);
	const log = new Log();

	const result = _compile(log, sources, {
		disableRewriting: false,
		keepWhitespace: false,
		trimSymbols: false,
		...pick(options, 'disableRewriting', 'keepWhitespace', 'trimSymbols'),
		renamingSymbols: isRenameSymbols(options.renamingSymbols) ? options.renamingSymbols : 'all',
		fileAccess: options.fileAccess && wrapFileAccess(options.fileAccess),
	});
	return {
		log: log.toString(),
		output: result?.output(options.format ?? 'json'),
	};
}

// Do a compile that can have queries done on it later
export function compileIDE(input: any, options: any = {}): any {
	const sources = sourcesFromInput(input);
	const log = new Log();

	const result = typeCheck(log, sources, options.fileAccess && wrapFileAccess(options.fileAccess));
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
		tooltipQuery(message: any): any {
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
		},
		definitionQuery(message: any): any {
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
		},
		symbolsQuery(message: any) {
			const name: string = message.source + '';
			let symbols: any[] = null;

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
		},
		renameQuery(message: any) {
			const name: string = message.source + '';
			const line: number = message.line | 0;
			const column: number = message.column | 0;
			let ranges: any[] = null;
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
		},
		completionQuery(message: any) {
			const name: string = message.source + '';
			const line: number = message.line | 0;
			const column: number = message.column | 0;
			let completions: any[] = [];

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
		},
		signatureQuery(message: any) {
			const name: string = message.source + '';
			const line: number = message.line | 0;
			const column: number = message.column | 0;
			let signatures: any[] = [];
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
				signatures,
				activeArgument,
				activeSignature,
			};
		},
	};
}

// Source code formatting
export function format(input: any, options: any): string {
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

	return _format(input?.toString(), indent, newline, trailingNewline);
}
