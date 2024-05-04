import { Log } from './log.js';
import { Source } from './source.js';
import { TokenKind, TokenKind_isBinaryOperator, TokenKind_isIdentifierOrType, TokenPurpose, tokenize } from './tokenizer.js';

export type TrailingNewline = 'preserve' | 'remove' | 'insert';

export function isTrailingNewline(arg: string): arg is TrailingNewline {
	return ['preserve', 'remove', 'insert'].includes(arg);
}

const onlyWhitespace = /^\s*$/;

export function _formatWhitespace(text: string, newline: string): string {
	const lineCount = (text.match(/is/g) || []).length;
	return newline.repeat(Math.min(lineCount, 2));
}

export function _keepSpaceBetween(prev: TokenKind, left: TokenKind, right: TokenKind): boolean {
	switch (right) {
		case TokenKind.INCREMENT:
			switch (left) {
				case TokenKind.PLUS:
					return true;
				case TokenKind.IDENTIFIER:
					return false;
			}
			break;

		case TokenKind.DECREMENT:
			switch (left) {
				case TokenKind.MINUS:
					return true;
				case TokenKind.IDENTIFIER:
					return false;
			}
			break;

		case TokenKind.PLUS:
			if (left == TokenKind.PLUS) {
				return true;
			}
			break;

		case TokenKind.MINUS:
			if (left == TokenKind.MINUS) {
				return true;
			}
			break;

		case TokenKind.LEFT_PARENTHESIS:
			if (TokenKind_isIdentifierOrType(left) || left === TokenKind.RIGHT_BRACKET) {
				return false;
			}
			break;

		case TokenKind.LEFT_BRACKET:
			if (TokenKind_isIdentifierOrType(left) || left === TokenKind.RIGHT_BRACKET) {
				return false;
			}
			break;

		case TokenKind.COMMA:
		case TokenKind.SEMICOLON:
		case TokenKind.RIGHT_PARENTHESIS:
		case TokenKind.RIGHT_BRACKET:
		case TokenKind.DOT:
			return false;
		case TokenKind.RIGHT_BRACE:
			if (left === TokenKind.LEFT_BRACE) {
				return false;
			}
			break;
	}

	switch (left) {
		case TokenKind.LEFT_PARENTHESIS:
		case TokenKind.LEFT_BRACKET:
		case TokenKind.DOT:
		case TokenKind.NOT:
		case TokenKind.COMPLEMENT:
			return false;

		case TokenKind.PLUS:
		case TokenKind.MINUS:
			switch (prev) {
				case TokenKind.EOF:
				case TokenKind.LEFT_PARENTHESIS:
				case TokenKind.LEFT_BRACKET:
				case TokenKind.COMMA:
				case TokenKind.COLON:
				case TokenKind.SEMICOLON:
				case TokenKind.NOT:
				case TokenKind.COMPLEMENT:
				case TokenKind.RETURN:
				case TokenKind.ELSE:
					return false;
			}

			if (TokenKind_isBinaryOperator(prev)) {
				return false;
			}
			break;

		case TokenKind.INCREMENT:
		case TokenKind.DECREMENT:
			if (right == TokenKind.IDENTIFIER) {
				return false;
			}
			break;
	}

	return true;
}

export function _trimMultiLineComment(comment: string, beforeComment: string, indent: string, newline: string): string {
	// Split the comment contents into lines
	const lines: string[] = [];
	let start = 0;

	for (let i = 0; i < comment.length; i++) {
		const c = comment[i];

		if (!(c == '\n' || c == '\r')) {
			continue;
		}

		lines.push(comment.slice(start, i));

		if (c == '\r' && i + 1 < comment.length && comment[i + 1] == '\n') {
			i++;
		}

		start = i + 1;
	}

	lines.push(comment.slice(start));

	// Find the start of the line containing the start of the comment
	let firstLine = beforeComment.length;

	while (firstLine > 0 && !(beforeComment[firstLine - 1] == '\n' || beforeComment[firstLine - 1] == '\r')) {
		firstLine--;
	}

	const lineBeforeComment = beforeComment.slice(firstLine);

	// Determine the common whitespace prefix
	let commonPrefix = lineBeforeComment;

	for (const line of lines.slice(1)) {
		if (onlyWhitespace.test(line)) {
			continue;
		}

		let i1 = 0;
		const n1 = line.length;

		while (i1 < n1 && i1 < commonPrefix.length && line.charCodeAt(i1) === commonPrefix.charCodeAt(i1)) {
			i1 = i1 + 1;
		}

		commonPrefix = commonPrefix.slice(0, i1);
	}

	// Join the lines together
	let result = '';

	for (const line of lines) {
		if (result === '') {
			if (onlyWhitespace.test(lineBeforeComment)) {
				result += lineBeforeComment.slice(commonPrefix.length);
			}

			result += line;
		} else {
			result += newline;

			if (!onlyWhitespace.test(line)) {
				result += indent + line.slice(commonPrefix.length);
			}
		}
	}

	return result;
}

export function format(input: string, indent: string, newline: string, trailingNewline: TrailingNewline): string {
	const log = new Log();
	const source = new Source('<stdin>', input);
	const tokens = tokenize(log, source, TokenPurpose.FORMAT);

	if (log.hasErrors()) {
		return input;
	}

	let text = '';
	let prevPrevKind = TokenKind.EOF;
	let prevKind = TokenKind.EOF;
	let prevEnd = 0;
	let nesting = 0;
	let isStartOfLine = true;
	let tokenIndex = 0;

	function consumeIf(when: (v0: TokenKind) => boolean) {
		const token = tokens[tokenIndex];

		if (!when(token.kind) || token.kind === TokenKind.EOF) {
			return false;
		}

		const newlines = forceMultiLine === tokenIndex ? '\n' : prevKind == TokenKind.EOF ? '' : _formatWhitespace(input.slice(prevEnd, token.range.start), newline);
		tokenIndex = tokenIndex + 1;
		text += newlines;

		if (newlines !== '') {
			isStartOfLine = true;
		}

		if (isStartOfLine) {
			text += indent.repeat(nesting);
		} else if (_keepSpaceBetween(prevPrevKind, prevKind, token.kind)) {
			text += ' ';
		}

		let slice = token.range.toString();

		switch (token.kind) {
			case TokenKind.SINGLE_LINE_COMMENT:
				slice = slice.slice(0, slice.search(/\s*$/));
				break;

			case TokenKind.MULTI_LINE_COMMENT: {
				slice = _trimMultiLineComment(slice, input.slice(0, token.range.start), indent.repeat(nesting), newline);
				break;
			}
		}

		text += slice;
		prevPrevKind = prevKind;
		prevKind = token.kind;
		prevEnd = token.range.end;
		isStartOfLine = false;

		switch (token.kind) {
			case TokenKind.LEFT_BRACE: {
				handleBraces();
				break;
			}

			case TokenKind.LEFT_PARENTHESIS: {
				handleParentheses();
				break;
			}

			case TokenKind.LEFT_BRACKET: {
				handleBrackets();
				break;
			}
		}

		return true;
	}

	const hasNewlineBefore: (v0: number) => boolean = (index: number) => {
		return !onlyWhitespace.test(input.slice(tokens[index - 1].range.end, tokens[index].range.start));
	};
	const isStatementEnd: (v0: TokenKind, v1: boolean) => boolean = (kind: TokenKind, isFirst: boolean) => {
		switch (kind) {
			case TokenKind.SEMICOLON:
			case TokenKind.RIGHT_BRACE: {
				return true;
			}

			// Recover when there's a missing semicolon. These tokens are always
			// guaranteed to start a new statement. They must not be able to appear
			// past the first token in a statement or the statement may incorrectly
			// end early.
			case TokenKind.BREAK:
			case TokenKind.CONTINUE:
			case TokenKind.DISCARD:
			case TokenKind.DO:
			case TokenKind.ELSE:
			case TokenKind.FOR:
			case TokenKind.IF:
			case TokenKind.RETURN:
			case TokenKind.WHILE: {
				return !isFirst;
			}
		}

		return false;
	};
	function handleStatement() {
		// Comments don't count as a statement
		while (
			consumeIf((kind: TokenKind) => {
				return kind === TokenKind.SINGLE_LINE_COMMENT || kind === TokenKind.MULTI_LINE_COMMENT;
			})
		) {}

		switch (tokens[tokenIndex].kind) {
			case TokenKind.EOF:
			case TokenKind.RIGHT_BRACE: {
				return false;
			}

			case TokenKind.IMPORT:
			case TokenKind.EXPORT: {
				consumeIf((kind: TokenKind) => {
					return true;
				});
				break;
			}

			case TokenKind.IF: {
				consumeIf((kind: TokenKind) => {
					return true;
				});

				if (handleBranch()) {
					handleBody();
				}

				// Consume an "else" after the if so it gets this statement's indentation level
				if (tokens[tokenIndex].kind === TokenKind.ELSE) {
					handleStatement();
				}
				break;
			}

			case TokenKind.FOR:
			case TokenKind.WHILE: {
				consumeIf((kind: TokenKind) => {
					return true;
				});

				if (handleBranch()) {
					handleBody();
				}
				break;
			}

			case TokenKind.DO: {
				consumeIf((kind: TokenKind) => {
					return true;
				});
				handleBody();

				if (
					consumeIf((kind: TokenKind) => {
						return kind === TokenKind.WHILE;
					})
				) {
					handleBranch();
					consumeIf((kind: TokenKind) => {
						return kind === TokenKind.SEMICOLON;
					});
				}
				break;
			}

			case TokenKind.ELSE: {
				consumeIf((kind: TokenKind) => {
					return true;
				});

				if (tokens[tokenIndex].kind === TokenKind.IF) {
					const isOnNewLine = hasNewlineBefore(tokenIndex);

					if (isOnNewLine) {
						nesting = nesting + 1;
					}

					consumeIf((kind: TokenKind) => {
						return true;
					});

					if (handleBranch()) {
						handleBody();
					}

					if (isOnNewLine) {
						nesting = nesting - 1;
					}
				} else {
					handleBody();
				}
				break;
			}

			case TokenKind.LEFT_BRACE:
			case TokenKind.SEMICOLON: {
				consumeIf((kind: TokenKind) => {
					return true;
				});
				break;
			}

			case TokenKind.EXTENSION:
			case TokenKind.VERSION:
			case TokenKind.INCLUDE:
			case TokenKind.PRAGMA: {
				consumeIf((kind: TokenKind) => {
					return true;
				});

				while (
					consumeIf((kind: TokenKind) => {
						return !hasNewlineBefore(tokenIndex);
					})
				) {}
				break;
			}

			default: {
				const couldBeType = TokenKind_isIdentifierOrType(tokens[tokenIndex].kind);
				consumeIf((kind: TokenKind) => {
					return true;
				});

				// Handle function declarations
				if (
					couldBeType &&
					consumeIf((kind: TokenKind) => {
						return kind === TokenKind.IDENTIFIER;
					}) &&
					consumeIf((kind: TokenKind) => {
						return kind === TokenKind.LEFT_PARENTHESIS;
					})
				) {
					if (
						!consumeIf((kind: TokenKind) => {
							return kind === TokenKind.LEFT_BRACE;
						})
					) {
						consumeIf((kind: TokenKind) => {
							return kind === TokenKind.SEMICOLON;
						});
					}
				} else {
					let isMultiLine = false;

					while (true) {
						if (!isMultiLine && hasNewlineBefore(tokenIndex)) {
							isMultiLine = true;
							nesting = nesting + 1;
						}

						if (
							!consumeIf((kind: TokenKind) => {
								return !isStatementEnd(kind, false);
							})
						) {
							break;
						}
					}

					consumeIf((kind: TokenKind) => {
						return kind === TokenKind.SEMICOLON;
					});

					if (isMultiLine) {
						nesting = nesting - 1;
					}
				}
				break;
			}
		}

		return true;
	}

	// Scan over non-block bodies until the ending ";"
	function handleBody() {
		let intended = 1;

		for (let i = tokenIndex; i < tokens.length; i++) {
			switch (tokens[i].kind) {
				// A comment doesn't count as a body
				case TokenKind.SINGLE_LINE_COMMENT:
				case TokenKind.MULTI_LINE_COMMENT: {
					continue;
				}

				case TokenKind.LEFT_BRACE: {
					intended = 0;
					break;
				}
			}

			break;
		}

		nesting = nesting + intended;
		handleStatement();
		nesting = nesting - intended;
	}

	// "if" or "for" or "while"
	const handleBranch: () => boolean = () => {
		// Double-indent in parentheses unless they are followed by a newline
		let doubleIndent = 1;

		if (tokens[tokenIndex].kind === TokenKind.LEFT_PARENTHESIS && hasNewlineBefore(tokenIndex + 1)) {
			doubleIndent = 0;
		}

		nesting = nesting + doubleIndent;

		if (
			!consumeIf((kind: TokenKind) => {
				return kind === TokenKind.LEFT_PARENTHESIS;
			})
		) {
			nesting = nesting - doubleIndent;
			return false;
		}

		nesting = nesting - doubleIndent;
		return true;
	};
	const indexOfClosingBrace: () => number = () => {
		const stack: TokenKind[] = [];
		let i = tokenIndex;

		while (i < tokens.length) {
			const kind = tokens[i].kind;

			switch (kind) {
				case TokenKind.LEFT_BRACE:
				case TokenKind.LEFT_BRACKET:
				case TokenKind.LEFT_PARENTHESIS: {
					stack.push(kind);
					break;
				}

				case TokenKind.RIGHT_BRACE: {
					if (stack.length === 0) {
						return i;
					}

					if (stack.pop() !== TokenKind.LEFT_BRACE) {
						return -1;
					}
					break;
				}

				case TokenKind.RIGHT_BRACKET: {
					if (stack.length === 0 || stack.pop() !== TokenKind.LEFT_BRACKET) {
						return -1;
					}
					break;
				}

				case TokenKind.RIGHT_PARENTHESIS: {
					if (stack.length === 0 || stack.pop() !== TokenKind.LEFT_PARENTHESIS) {
						return -1;
					}
					break;
				}
			}

			i++;
		}

		return -1;
	};
	let forceMultiLine = -1;
	function handleBraces() {
		const rightBrace = indexOfClosingBrace();
		const isMultiLine = rightBrace !== -1 && input.slice(tokens[tokenIndex - 1].range.end, tokens[rightBrace].range.start).includes('\n');

		if (isMultiLine) {
			forceMultiLine = tokenIndex;
		}

		nesting = nesting + 1;

		while (handleStatement()) {}

		nesting = nesting - 1;

		if (isMultiLine) {
			forceMultiLine = tokenIndex;
		}

		consumeIf((kind: TokenKind) => {
			return kind === TokenKind.RIGHT_BRACE;
		});
	}
	function handleParentheses() {
		nesting = nesting + 1;

		while (
			consumeIf((kind: TokenKind) => {
				return kind !== TokenKind.RIGHT_PARENTHESIS;
			})
		) {}

		nesting = nesting - 1;
		consumeIf((kind: TokenKind) => {
			return kind === TokenKind.RIGHT_PARENTHESIS;
		});
	}
	function handleBrackets() {
		nesting = nesting + 1;

		while (
			consumeIf((kind: TokenKind) => {
				return kind !== TokenKind.RIGHT_BRACKET;
			})
		) {}

		nesting = nesting - 1;
		consumeIf((kind: TokenKind) => {
			return kind === TokenKind.RIGHT_BRACKET;
		});
	}

	// Consume all tokens
	while (
		handleStatement() ||
		consumeIf((kind: TokenKind) => {
			return kind !== TokenKind.EOF;
		})
	) {}

	const newlines = _formatWhitespace(input.slice(prevEnd), newline);

	switch (trailingNewline) {
		case 'preserve': {
			if (newlines !== '') {
				text += newline;
			}
			break;
		}

		case 'insert': {
			if (text !== '') {
				text += newline;
			}
			break;
		}
	}

	return text;
}
