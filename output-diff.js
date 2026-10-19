(function(scope) {
  "use strict";
  const hidden = /[\u200B\u2060\uFEFF]/gu;
  const normalized = text => text.replace(hidden,'').normalize('NFC');
  const tokens = text => normalized(text).match(/\S+/gu) || [];
  function describe(character, language) {
    const hu = language === 'hu';
    if (!character) return hu ? 'kimenet vége' : 'end of output';
    const names = {
      ' ':hu?'szóköz (␠)':'space (␠)', '\n':hu?'sortörés (\\n)':'newline (\\n)',
      '\r':hu?'kocsivissza (\\r)':'carriage return (\\r)', '\t':hu?'tabulátor (\\t)':'tab (\\t)',
      '\u00A0':hu?'nem törhető szóköz (U+00A0)':'non-breaking space (U+00A0)',
      '\u200B':hu?'zérószélességű szóköz (U+200B)':'zero-width space (U+200B)',
      '\u2060':hu?'szótörést tiltó jel (U+2060)':'word joiner (U+2060)',
      '\uFEFF':'BOM (U+FEFF)'
    };
    return names[character] || `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')}`;
  }
  function visibleWhitespace(text) {
    const characters = Array.from(text);
    const symbols = characters.slice(0,12).map(char => char === ' ' ? '␠' : char === '\n' ? '\\n' : char === '\r' ? '\\r' : char === '\t' ? '\\t' : `U+${char.codePointAt(0).toString(16).toUpperCase()}`).join('');
    return symbols ? symbols+(characters.length>12?'…':'') : '∅';
  }
  function lineEnding(text) {
    const kinds=[];
    if (/\r\n/u.test(text)) kinds.push('CRLF');
    if (/(?<!\r)\n/u.test(text)) kinds.push('LF');
    if (/\r(?!\n)/u.test(text)) kinds.push('CR');
    return kinds.join(' + ') || '∅';
  }
  function analyze(expected, actual) {
    if (typeof expected !== 'string' || typeof actual !== 'string' || expected === actual) return null;
    // Avoid doing expensive comparisons on unusually large browser previews.
    if (expected.length+actual.length > 2000000) return null;
    const expectedTokens=tokens(expected), actualTokens=tokens(actual);
    // Token boundaries matter: "12" and "1 2" are different visible values.
    if (expectedTokens.length !== actualTokens.length || expectedTokens.some((token,index)=>token !== actualTokens[index])) return null;
    let index=0;
    while (index<expected.length && index<actual.length && expected[index]===actual[index]) index++;
    const before=expected.slice(0,index).split(/\r\n|\r|\n/u);
    const line=before.length, column=Array.from(before.at(-1)).length+1;
    const expectedCharacter=index<expected.length?String.fromCodePoint(expected.codePointAt(index)):'';
    const actualCharacter=index<actual.length?String.fromCodePoint(actual.codePointAt(index)):'';
    const expectedTail=expected.match(/[\s\u200B\u2060]+$/u)?.[0] || '';
    const actualTail=actual.match(/[\s\u200B\u2060]+$/u)?.[0] || '';
    const detail={};
    for (const language of ['hu','en']) {
      detail[language]=language==='hu' ?
        `Első eltérés: ${line}. sor, ${column}. karakter. Elvárt: ${describe(expectedCharacter,language)}; hallgatói: ${describe(actualCharacter,language)}.` :
        `First difference: line ${line}, character ${column}. Expected: ${describe(expectedCharacter,language)}; submitted: ${describe(actualCharacter,language)}.`;
      if (expectedTail!==actualTail) detail[language]+=(language==='hu'?' Záró whitespace — elvárt: ':' Trailing whitespace — expected: ')+visibleWhitespace(expectedTail)+(language==='hu'?'; hallgatói: ':'; submitted: ')+visibleWhitespace(actualTail)+'.';
    }
    let kind, hu, en;
    if (expected.replace(/\r\n|\r/gu,'\n')===actual.replace(/\r\n|\r/gu,'\n')) {
      kind='line-endings'; hu=`Eltérő sorvégek: elvárt ${lineEnding(expected)}, hallgatói ${lineEnding(actual)}.`;
      en=`Different line endings: expected ${lineEnding(expected)}, submitted ${lineEnding(actual)}.`;
    } else if (expected.slice(0,expected.length-expectedTail.length)===actual.slice(0,actual.length-actualTail.length)) {
      kind='trailing-whitespace';
      if (!expectedTail && /^(?:\r\n|\r|\n)+$/u.test(actualTail)) {
        hu=`Plusz sortörés a hallgatói kimenet végén (${visibleWhitespace(actualTail)}).`;
        en=`Extra newline at the end of the submitted output (${visibleWhitespace(actualTail)}).`;
      } else if (!actualTail && /^(?:\r\n|\r|\n)+$/u.test(expectedTail)) {
        hu=`Hiányzó sortörés a hallgatói kimenet végén (${visibleWhitespace(expectedTail)}).`;
        en=`Missing newline at the end of the submitted output (${visibleWhitespace(expectedTail)}).`;
      } else {
        hu=`Eltérő záró whitespace: elvárt ${visibleWhitespace(expectedTail)}, hallgatói ${visibleWhitespace(actualTail)}.`;
        en=`Different trailing whitespace: expected ${visibleWhitespace(expectedTail)}, submitted ${visibleWhitespace(actualTail)}.`;
      }
    } else if (normalized(expected)===normalized(actual)) {
      kind='unicode';
      const invisibleOnly=expected.replace(hidden,'')===actual.replace(hidden,'');
      hu=invisibleOnly?'Láthatatlan Unicode-karakter tér el (pl. BOM vagy zérószélességű szóköz).':'Azonos karakterek eltérő Unicode-ábrázolással (NFC/NFD).';
      en=invisibleOnly?'Invisible Unicode character differs (e.g. BOM or zero-width space).':'Same characters with different Unicode representations (NFC/NFD).';
    } else {
      kind='whitespace';
      hu=`Csak whitespace/formázási eltérés: ${describe(expectedCharacter,'hu')} → ${describe(actualCharacter,'hu')} (${line}. sor, ${column}. karakter).`;
      en=`Whitespace/formatting-only difference: ${describe(expectedCharacter,'en')} → ${describe(actualCharacter,'en')} (line ${line}, character ${column}).`;
    }
    return {kind,hu,en,detail};
  }
  const api={analyze};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else scope.ProgenvOutputDiff=api;
})(globalThis);
