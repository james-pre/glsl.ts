import { List_get2, string_get13, StringMap_get3, StringMap_insert1 } from '../native-js.js';
import { Log } from './log.js';
import { Range } from './range.js';
import { Source } from './source.js';

export enum TokenKind {
	SINGLE_LINE_COMMENT,
	MULTI_LINE_COMMENT,

	// Standard keywords
	ATTRIBUTE,
	BOOL,
	BREAK,
	BVEC2,
	BVEC3,
	BVEC4,
	CONST,
	CONTINUE,
	DISCARD,
	DO,
	ELSE,
	FALSE,
	FLOAT,
	FOR,
	HIGHP,
	IF,
	IN,
	INOUT,
	INT,
	INVARIANT,
	IVEC2,
	IVEC3,
	IVEC4,
	LOWP,
	MAT2,
	MAT3,
	MAT4,
	MEDIUMP,
	OUT,
	PRECISION,
	RETURN,
	SAMPLER2D,
	SAMPLERCUBE,
	STRUCT,
	TRUE,
	UNIFORM,
	VARYING,
	VEC2,
	VEC3,
	VEC4,
	VOID,
	WHILE,

	// Non-standard keywords
	EXPORT,
	IMPORT,

	// Unary
	COMPLEMENT,
	DECREMENT,
	INCREMENT,
	NOT,

	// Binary
	BITWISE_AND,
	BITWISE_OR,
	BITWISE_XOR,
	DIVIDE,
	EQUAL,
	GREATER_THAN,
	GREATER_THAN_OR_EQUAL,
	LESS_THAN,
	LESS_THAN_OR_EQUAL,
	LOGICAL_AND,
	LOGICAL_OR,
	LOGICAL_XOR,
	MINUS,
	MULTIPLY,
	NOT_EQUAL,
	PLUS,
	REMAINDER,
	SHIFT_LEFT,
	SHIFT_RIGHT,

	// Binary assignment
	ASSIGN,
	ASSIGN_ADD,
	ASSIGN_BITWISE_AND,
	ASSIGN_BITWISE_OR,
	ASSIGN_BITWISE_XOR,
	ASSIGN_DIVIDE,
	ASSIGN_MULTIPLY,
	ASSIGN_REMAINDER,
	ASSIGN_SHIFT_LEFT,
	ASSIGN_SHIFT_RIGHT,
	ASSIGN_SUBTRACT,

	// Other operators
	COLON,
	COMMA,
	DOT,
	LEFT_BRACE,
	LEFT_BRACKET,
	LEFT_PARENTHESIS,
	QUESTION,
	RIGHT_BRACE,
	RIGHT_BRACKET,
	RIGHT_PARENTHESIS,
	SEMICOLON,

	// Pragmas
	EXTENSION,
	VERSION,
	INCLUDE,
	PRAGMA,

	// Literals
	FLOAT_LITERAL,
	IDENTIFIER,
	INT_LITERAL,
	STRING_LITERAL,

	// This is always at the end of the token stream
	END_OF_FILE,
}

export class Token {
	range: Range;
	kind: TokenKind;
	comments: Array<Range>;

	constructor(range: Range, kind: TokenKind, comments: Array<Range>) {
		this.range = range;
		this.kind = kind;
		this.comments = comments;
	}
}

export const enum TokenPurpose {
	COMPILE,
	FORMAT,
}

export function tokenize(log: Log, source: Source, purpose: TokenPurpose): Array<Token> {
	let parts: Array<string> = source.contents.split(_tokenRegex);
	let tokens: Array<Token> = [];
	let comments: Array<Range> = null;
	let prevCommentTokenCount = 0;
	let start = 0;

	for (let i = 0, count1 = parts.length; i < count1; i = i + 1) {
		let part = List_get2(parts, i);
		let count = part.length;
		let end = start + count;
		let range = new Range(source, start, end);

		if (i % 2 !== 0) {
			let c = string_get13(part, 0);

			// Identifier
			if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95) {
				let keyword = StringMap_get3(keywords, part, TokenKind.END_OF_FILE);

				if (keyword !== TokenKind.END_OF_FILE) {
					tokens.push(new Token(range, keyword, comments));
				} else if (reservedWords.has(part)) {
					log.syntaxErrorReservedWord(range);
				} else {
					tokens.push(new Token(range, TokenKind.IDENTIFIER, comments));
				}
			}

			// Number
			else if ((c >= 48 && c <= 57) || (c === 46 && count > 1)) {
				tokens.push(new Token(range, _intRegex.test(part) ? TokenKind.INT_LITERAL : TokenKind.FLOAT_LITERAL, comments));
			}

			// Pragma
			else if (c === 35) {
				let kind = TokenKind.PRAGMA;
				let value = part;

				if (value === '#version') {
					kind = TokenKind.VERSION;
				} else if (value === '#extension') {
					kind = TokenKind.EXTENSION;
				} else if (value === '#include') {
					kind = TokenKind.INCLUDE;
				}

				tokens.push(new Token(range, kind, comments));
			}

			// String literal
			else if (c === 34) {
				tokens.push(new Token(range, TokenKind.STRING_LITERAL, comments));
			}

			// Operator
			else {
				let kind1 = StringMap_get3(operators, part, TokenKind.END_OF_FILE);

				if (kind1 === TokenKind.END_OF_FILE) {
					if (part.startsWith('//')) {
						if (purpose === TokenPurpose.FORMAT) {
							kind1 = TokenKind.SINGLE_LINE_COMMENT;
						} else {
							(comments !== null ? comments : (comments = [])).push(range);
						}
					} else if (part.startsWith('/*')) {
						if (purpose === TokenPurpose.FORMAT) {
							kind1 = TokenKind.MULTI_LINE_COMMENT;
						} else {
							(comments !== null ? comments : (comments = [])).push(range);
						}
					}
				}

				if (kind1 !== TokenKind.END_OF_FILE) {
					tokens.push(new Token(range, kind1, comments));
				}
			}
		} else if (part !== '') {
			log.syntaxErrorExtraData(range, part);
			break;
		}

		// Reset the comment list after every non-comment token
		if (tokens.length !== prevCommentTokenCount) {
			comments = null;
			prevCommentTokenCount = tokens.length;
		}

		start = end;
	}

	tokens.push(new Token(new Range(source, start, start), TokenKind.END_OF_FILE, comments));
	return tokens;
}

export function TokenKind_isBinaryOperator(self: TokenKind): boolean {
	return self >= TokenKind.BITWISE_AND && self <= TokenKind.ASSIGN_SUBTRACT;
}

export function TokenKind_isIdentifierOrType(self: TokenKind): boolean {
	switch (self) {
		case TokenKind.IDENTIFIER:
		case TokenKind.VOID:
		case TokenKind.SAMPLER2D:
		case TokenKind.SAMPLERCUBE:
		case TokenKind.FLOAT:
		case TokenKind.VEC2:
		case TokenKind.VEC3:
		case TokenKind.VEC4:
		case TokenKind.INT:
		case TokenKind.IVEC2:
		case TokenKind.IVEC3:
		case TokenKind.IVEC4:
		case TokenKind.BOOL:
		case TokenKind.BVEC2:
		case TokenKind.BVEC3:
		case TokenKind.BVEC4:
		case TokenKind.MAT2:
		case TokenKind.MAT3:
		case TokenKind.MAT4: {
			return true;
		}
	}

	return false;
}

// The order matters here due to greedy matching
export let _tokenRegex: any = new RegExp(
	'(' +
		// Float literal
		'\\.[0-9]+[eE][+-]?[0-9]+\\b|' + // Floating-point constant
		'\\.[0-9]+\\b|' + // Floating-point constant
		'[0-9]+\\.[0-9]+[eE][+-]?[0-9]+\\b|' + // Floating-point constant
		'[0-9]+\\.[0-9]+\\b|' + // Floating-point constant
		'[0-9]+\\.[eE][+-]?[0-9]+\\b|' + // Floating-point constant
		'[0-9]+\\.|' + // Floating-point constant
		'[0-9]+[eE][+-]?[0-9]+\\b|' + // Floating-point constant
		// Int literals
		'[1-9][0-9]*\\b|' + // Decimal int literal
		'0[0-7]*\\b|' + // Octal int literal
		'0[xX][0-9A-Fa-f]+\\b|' + // Hexadecimal int literal
		// Other
		'[ \t\r\n]|' + // Whitespace
		'/\\*(?:.|\r\n|\n)*?\\*/|' + // Multi-line comment
		'//.*|' + // Single-line comment
		'&&|\\|\\||\\^\\^|\\+\\+|--|<<=?|>>=?|[()[\\]{}\\.,?:;]|[+\\-*/%=!<>&|^~]=?|' + // Operator
		'[A-Za-z_][A-Za-z0-9_]*\\b|' + // Identifier
		'#\\w+\\b|' + // Pragma
		'"(?:[^"\\\\]|\\\\.)*"' + // String literal
		')'
);
export let _intRegex: any = new RegExp('^(' + '[1-9][0-9]*|' + '0[0-7]*|' + '0[xX][0-9A-Fa-f]+' + ')$');
export let keywords = StringMap_insert1(
	StringMap_insert1(
		StringMap_insert1(
			StringMap_insert1(
				StringMap_insert1(
					StringMap_insert1(
						StringMap_insert1(
							StringMap_insert1(
								StringMap_insert1(
									StringMap_insert1(
										StringMap_insert1(
											StringMap_insert1(
												StringMap_insert1(
													StringMap_insert1(
														StringMap_insert1(
															StringMap_insert1(
																StringMap_insert1(
																	StringMap_insert1(
																		StringMap_insert1(
																			StringMap_insert1(
																				StringMap_insert1(
																					StringMap_insert1(
																						StringMap_insert1(
																							StringMap_insert1(
																								StringMap_insert1(
																									StringMap_insert1(
																										StringMap_insert1(
																											StringMap_insert1(
																												StringMap_insert1(
																													StringMap_insert1(
																														StringMap_insert1(
																															StringMap_insert1(
																																StringMap_insert1(
																																	StringMap_insert1(
																																		StringMap_insert1(
																																			StringMap_insert1(
																																				StringMap_insert1(
																																					StringMap_insert1(
																																						StringMap_insert1(
																																							StringMap_insert1(
																																								StringMap_insert1(
																																									StringMap_insert1(
																																										StringMap_insert1(
																																											StringMap_insert1(
																																												new Map(),
																																												'attribute',
																																												TokenKind.ATTRIBUTE
																																											),
																																											'bool',
																																											TokenKind.BOOL
																																										),
																																										'break',
																																										TokenKind.BREAK
																																									),
																																									'bvec2',
																																									TokenKind.BVEC2
																																								),
																																								'bvec3',
																																								TokenKind.BVEC3
																																							),
																																							'bvec4',
																																							TokenKind.BVEC4
																																						),
																																						'const',
																																						TokenKind.CONST
																																					),
																																					'continue',
																																					TokenKind.CONTINUE
																																				),
																																				'discard',
																																				TokenKind.DISCARD
																																			),
																																			'do',
																																			TokenKind.DO
																																		),
																																		'else',
																																		TokenKind.ELSE
																																	),
																																	'false',
																																	TokenKind.FALSE
																																),
																																'float',
																																TokenKind.FLOAT
																															),
																															'for',
																															TokenKind.FOR
																														),
																														'highp',
																														TokenKind.HIGHP
																													),
																													'if',
																													TokenKind.IF
																												),
																												'in',
																												TokenKind.IN
																											),
																											'inout',
																											TokenKind.INOUT
																										),
																										'int',
																										TokenKind.INT
																									),
																									'invariant',
																									TokenKind.INVARIANT
																								),
																								'ivec2',
																								TokenKind.IVEC2
																							),
																							'ivec3',
																							TokenKind.IVEC3
																						),
																						'ivec4',
																						TokenKind.IVEC4
																					),
																					'lowp',
																					TokenKind.LOWP
																				),
																				'mat2',
																				TokenKind.MAT2
																			),
																			'mat3',
																			TokenKind.MAT3
																		),
																		'mat4',
																		TokenKind.MAT4
																	),
																	'mediump',
																	TokenKind.MEDIUMP
																),
																'out',
																TokenKind.OUT
															),
															'precision',
															TokenKind.PRECISION
														),
														'return',
														TokenKind.RETURN
													),
													'sampler2D',
													TokenKind.SAMPLER2D
												),
												'samplerCube',
												TokenKind.SAMPLERCUBE
											),
											'struct',
											TokenKind.STRUCT
										),
										'true',
										TokenKind.TRUE
									),
									'uniform',
									TokenKind.UNIFORM
								),
								'varying',
								TokenKind.VARYING
							),
							'vec2',
							TokenKind.VEC2
						),
						'vec3',
						TokenKind.VEC3
					),
					'vec4',
					TokenKind.VEC4
				),
				'void',
				TokenKind.VOID
			),
			'while',
			TokenKind.WHILE
		),
		'export',
		TokenKind.EXPORT
	),
	'import',
	TokenKind.IMPORT
);
export let operators = StringMap_insert1(
	StringMap_insert1(
		StringMap_insert1(
			StringMap_insert1(
				StringMap_insert1(
					StringMap_insert1(
						StringMap_insert1(
							StringMap_insert1(
								StringMap_insert1(
									StringMap_insert1(
										StringMap_insert1(
											StringMap_insert1(
												StringMap_insert1(
													StringMap_insert1(
														StringMap_insert1(
															StringMap_insert1(
																StringMap_insert1(
																	StringMap_insert1(
																		StringMap_insert1(
																			StringMap_insert1(
																				StringMap_insert1(
																					StringMap_insert1(
																						StringMap_insert1(
																							StringMap_insert1(
																								StringMap_insert1(
																									StringMap_insert1(
																										StringMap_insert1(
																											StringMap_insert1(
																												StringMap_insert1(
																													StringMap_insert1(
																														StringMap_insert1(
																															StringMap_insert1(
																																StringMap_insert1(
																																	StringMap_insert1(
																																		StringMap_insert1(
																																			StringMap_insert1(
																																				StringMap_insert1(
																																					StringMap_insert1(
																																						StringMap_insert1(
																																							StringMap_insert1(
																																								StringMap_insert1(
																																									StringMap_insert1(
																																										StringMap_insert1(
																																											StringMap_insert1(
																																												StringMap_insert1(
																																													new Map(),
																																													'~',
																																													TokenKind.COMPLEMENT
																																												),
																																												'--',
																																												TokenKind.DECREMENT
																																											),
																																											'++',
																																											TokenKind.INCREMENT
																																										),
																																										'!',
																																										TokenKind.NOT
																																									),
																																									'&',
																																									TokenKind.BITWISE_AND
																																								),
																																								'|',
																																								TokenKind.BITWISE_OR
																																							),
																																							'^',
																																							TokenKind.BITWISE_XOR
																																						),
																																						'/',
																																						TokenKind.DIVIDE
																																					),
																																					'==',
																																					TokenKind.EQUAL
																																				),
																																				'>',
																																				TokenKind.GREATER_THAN
																																			),
																																			'>=',
																																			TokenKind.GREATER_THAN_OR_EQUAL
																																		),
																																		'<',
																																		TokenKind.LESS_THAN
																																	),
																																	'<=',
																																	TokenKind.LESS_THAN_OR_EQUAL
																																),
																																'&&',
																																TokenKind.LOGICAL_AND
																															),
																															'||',
																															TokenKind.LOGICAL_OR
																														),
																														'^^',
																														TokenKind.LOGICAL_XOR
																													),
																													'-',
																													TokenKind.MINUS
																												),
																												'*',
																												TokenKind.MULTIPLY
																											),
																											'!=',
																											TokenKind.NOT_EQUAL
																										),
																										'+',
																										TokenKind.PLUS
																									),
																									'%',
																									TokenKind.REMAINDER
																								),
																								'<<',
																								TokenKind.SHIFT_LEFT
																							),
																							'>>',
																							TokenKind.SHIFT_RIGHT
																						),
																						'=',
																						TokenKind.ASSIGN
																					),
																					'+=',
																					TokenKind.ASSIGN_ADD
																				),
																				'&=',
																				TokenKind.ASSIGN_BITWISE_AND
																			),
																			'|=',
																			TokenKind.ASSIGN_BITWISE_OR
																		),
																		'^=',
																		TokenKind.ASSIGN_BITWISE_XOR
																	),
																	'/=',
																	TokenKind.ASSIGN_DIVIDE
																),
																'*=',
																TokenKind.ASSIGN_MULTIPLY
															),
															'%=',
															TokenKind.ASSIGN_REMAINDER
														),
														'<<=',
														TokenKind.ASSIGN_SHIFT_LEFT
													),
													'>>=',
													TokenKind.ASSIGN_SHIFT_RIGHT
												),
												'-=',
												TokenKind.ASSIGN_SUBTRACT
											),
											':',
											TokenKind.COLON
										),
										',',
										TokenKind.COMMA
									),
									'.',
									TokenKind.DOT
								),
								'{',
								TokenKind.LEFT_BRACE
							),
							'[',
							TokenKind.LEFT_BRACKET
						),
						'(',
						TokenKind.LEFT_PARENTHESIS
					),
					'?',
					TokenKind.QUESTION
				),
				'}',
				TokenKind.RIGHT_BRACE
			),
			']',
			TokenKind.RIGHT_BRACKET
		),
		')',
		TokenKind.RIGHT_PARENTHESIS
	),
	';',
	TokenKind.SEMICOLON
);
export let reservedWords = StringMap_insert1(
	StringMap_insert1(
		StringMap_insert1(
			StringMap_insert1(
				StringMap_insert1(
					StringMap_insert1(
						StringMap_insert1(
							StringMap_insert1(
								StringMap_insert1(
									StringMap_insert1(
										StringMap_insert1(
											StringMap_insert1(
												StringMap_insert1(
													StringMap_insert1(
														StringMap_insert1(
															StringMap_insert1(
																StringMap_insert1(
																	StringMap_insert1(
																		StringMap_insert1(
																			StringMap_insert1(
																				StringMap_insert1(
																					StringMap_insert1(
																						StringMap_insert1(
																							StringMap_insert1(
																								StringMap_insert1(
																									StringMap_insert1(
																										StringMap_insert1(
																											StringMap_insert1(
																												StringMap_insert1(
																													StringMap_insert1(
																														StringMap_insert1(
																															StringMap_insert1(
																																StringMap_insert1(
																																	StringMap_insert1(
																																		StringMap_insert1(
																																			StringMap_insert1(
																																				StringMap_insert1(
																																					StringMap_insert1(
																																						StringMap_insert1(
																																							StringMap_insert1(
																																								StringMap_insert1(
																																									StringMap_insert1(
																																										StringMap_insert1(
																																											StringMap_insert1(
																																												StringMap_insert1(
																																													StringMap_insert1(
																																														StringMap_insert1(
																																															StringMap_insert1(
																																																StringMap_insert1(
																																																	new Map(),
																																																	'asm',
																																																	0
																																																),
																																																'cast',
																																																0
																																															),
																																															'class',
																																															0
																																														),
																																														'default',
																																														0
																																													),
																																													'double',
																																													0
																																												),
																																												'dvec2',
																																												0
																																											),
																																											'dvec3',
																																											0
																																										),
																																										'dvec4',
																																										0
																																									),
																																									'enum',
																																									0
																																								),
																																								'extern',
																																								0
																																							),
																																							'external',
																																							0
																																						),
																																						'fixed',
																																						0
																																					),
																																					'flat',
																																					0
																																				),
																																				'fvec2',
																																				0
																																			),
																																			'fvec3',
																																			0
																																		),
																																		'fvec4',
																																		0
																																	),
																																	'goto',
																																	0
																																),
																																'half',
																																0
																															),
																															'hvec2',
																															0
																														),
																														'hvec3',
																														0
																													),
																													'hvec4',
																													0
																												),
																												'inline',
																												0
																											),
																											'input',
																											0
																										),
																										'interface',
																										0
																									),
																									'long',
																									0
																								),
																								'namespace',
																								0
																							),
																							'noinline',
																							0
																						),
																						'output',
																						0
																					),
																					'packed',
																					0
																				),
																				'public',
																				0
																			),
																			'sampler1D',
																			0
																		),
																		'sampler1DShadow',
																		0
																	),
																	'sampler2DRect',
																	0
																),
																'sampler2DRectShadow',
																0
															),
															'sampler2DShadow',
															0
														),
														'sampler3D',
														0
													),
													'sampler3DRect',
													0
												),
												'short',
												0
											),
											'sizeof',
											0
										),
										'static',
										0
									),
									'superp',
									0
								),
								'switch',
								0
							),
							'template',
							0
						),
						'this',
						0
					),
					'typedef',
					0
				),
				'union',
				0
			),
			'unsigned',
			0
		),
		'using',
		0
	),
	'volatile',
	0
);
