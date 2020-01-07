import { ParserState, Context } from '../parser/common';
import { Token, descKeywordTable } from '../token';
import { report, Errors } from '../errors';
import { Chars, isIdentifierPart, CharTypes, fromCodePoint, toHex, unicodeLookup } from './';

export function scanIdentifier(parser: ParserState, context: Context, source: string, char: number): Token {
  while ((CharTypes[char] & 0b00000000000000000000000000000101) > 0) {
    char = source.charCodeAt(++parser.index);
  }
  const value = source.slice(parser.start, parser.index);
  if (char > Chars.UpperZ) return scanIdentifierSlowPath(parser, context, source, value, 0, 0);
  parser.tokenValue = value;
  return Token.Identifier;
}

export function scanIdentifierOrKeyword(parser: ParserState, context: Context, source: string, char: number): Token {
  while ((CharTypes[char] & 0b00000000000000000000000000000101) > 0) {
    char = source.charCodeAt(++parser.index);
  }
  const value = source.slice(parser.start, parser.index);
  if (char > Chars.UpperZ) return scanIdentifierSlowPath(parser, context, source, value, 1, 0);
  parser.tokenValue = value;
  return descKeywordTable[value] || Token.Identifier;
}

export function scanIdentifierSlowPath(
  parser: ParserState,
  _context: Context,
  source: string,
  value: string,
  maybeKeyword: 0 | 1,
  escaped: 0 | 1
): Token {
  let start = parser.index;
  let char = source.charCodeAt(parser.index);
  let code: number | null = null;

  while (parser.index < parser.length) {
    if (char === Chars.Backslash) {
      value += source.slice(start, parser.index);
      escaped = 1;
      code = scanUnicodeEscape(parser, source);
      if (!isIdentifierPart(code)) report(parser, Errors.InvalidUnicodeEscapeSequence);
      maybeKeyword = 1;
      value += fromCodePoint(code);
      start = parser.index;
    } else {
      if ((char & 0xfc00) === 0xd800) {
        const lo = source.charCodeAt(parser.index + 1);
        if ((lo & 0xfc00) === 0xdc00) {
          char = 0x10000 + ((char & 0x3ff) << 10) + (lo & 0x3ff);
          if (((unicodeLookup[(char >>> 5) + 0] >>> char) & 31 & 1) === 0) {
            report(parser, Errors.Unexpected);
          }
          parser.index++;
        }
      }
      if (!isIdentifierPart(char)) break;
      parser.index++;
    }
    char = source.charCodeAt(parser.index);
  }

  value += source.slice(start, parser.index);

  const length = value.length;

  parser.tokenValue = value;

  if (maybeKeyword && length >= 2 && length <= 11) {
    const token: Token | undefined = descKeywordTable[parser.tokenValue];

    if (token === void 0) return Token.Identifier;

    if (escaped === 0) return token;

    // if (context & Context.AllowEscapedKeyword) {
    // if (context & Context.Strict && (token === Token.LetKeyword || token === Token.StaticKeyword)) {
    // return Token.EscapedFutureReserved;
    //}
    //if (token === void 0) return Token.Identifier;

    return token;
    //}

    //return Token.EscapedIdentifier;
  }

  return Token.Identifier;
}
/**
 * Scans unicode identifier
 *
 * @param parser  Parser object
 */
export function scanUnicodeEscape(parser: ParserState, source: string): number {
  // Check for Unicode escape of the form '\uXXXX'
  // and return code point value if valid Unicode escape is found.
  if (source.charCodeAt(parser.index + 1) !== Chars.LowerU) {
    report(parser, Errors.InvalidUnicodeEscapeSequence);
  }

  let code = 0;
  let char = source.charCodeAt((parser.index += 2));
  if (char === Chars.LeftBrace) {
    let digit = toHex(source.charCodeAt(++parser.index));
    if (digit < 0) report(parser, Errors.InvalidHexEscapeSequence);
    while (digit >= 0) {
      code = (code << 4) | digit;
      if (code > Chars.LastUnicodeChar) report(parser, Errors.UnicodeOverflow);
      digit = toHex((char = source.charCodeAt(++parser.index)));
    }

    // At least 4 characters have to be read
    if (code < 0 || char !== Chars.RightBrace) report(parser, Errors.InvalidHexEscapeSequence);

    parser.index++; // consumes '}'
    return code;
  }

  // \uNNNN

  let i = 0;
  for (i = 0; i < 4; i++) {
    const digit = toHex(source.charCodeAt(parser.index));
    if (digit < 0) report(parser, Errors.InvalidHexEscapeSequence);
    code = (code << 4) | digit;
    parser.index++;
  }

  return code;
}

export function scanUnicodeEscapeIdStart(parser: ParserState, context: Context, source: string): Token {
  const cookedChar = scanUnicodeEscape(parser, source);
  if (isIdentifierPart(cookedChar)) {
    return scanIdentifierSlowPath(parser, context, source, fromCodePoint(cookedChar), /* maybeKeyword */ 1, 1);
  }
  parser.index++; // skip: '\'
  report(parser, Errors.InvalidUnicodeEscapeSequence);
}
