import { describe, expect, it } from 'vitest';
import { checkSvg } from '../../src/main/storyboards/svgSafety';
import { EXCALIDRAW_SVG } from '../fixtures/storyboards';

const MAX = 512 * 1024;
const svg = (inner: string, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"${attrs}>${inner}</svg>`;

function rejected(text: string, max = MAX) {
  const r = checkSvg(text, max);
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.reason;
}

describe('checkSvg', () => {
  it('accepts a real Excalidraw export with its embedded scene and inlined fonts', () => {
    expect(checkSvg(EXCALIDRAW_SVG, MAX)).toEqual({ ok: true });
  });

  it('accepts fragment references and data:image URLs', () => {
    const ok = svg('<defs><rect id="r" width="1" height="1"/></defs><use href="#r"/><use xlink:href="#r"/><image href="data:image/png;base64,iVBORw0KGgo="/>');
    expect(checkSvg(ok, MAX)).toEqual({ ok: true });
    expect(checkSvg(svg('<rect style="fill:url(#g)"/><style>.a{background:url(data:image/png;base64,AA==)}</style>'), MAX)).toEqual({ ok: true });
  });

  it('rejects script elements, in any case or namespace prefix', () => {
    expect(rejected(svg('<script>alert(1)</script>'))).toMatch(/script/);
    expect(rejected(svg('<SCRIPT>alert(1)</SCRIPT>'))).toMatch(/script/);
    expect(rejected(svg('<s:script xmlns:s="http://www.w3.org/2000/svg">alert(1)</s:script>'))).toMatch(/script/);
  });

  it('rejects event handler attributes', () => {
    expect(rejected(svg('<rect onclick="alert(1)"/>'))).toMatch(/onclick/);
    expect(rejected(svg('', ' onload="alert(1)"'))).toMatch(/onload/);
    expect(rejected(svg('<rect ONMOUSEOVER="x"/>'))).toMatch(/onmouseover/i);
  });

  it('rejects foreignObject', () => {
    expect(rejected(svg('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>'))).toMatch(/foreignObject/i);
  });

  it('rejects external href and xlink:href, and javascript: URLs', () => {
    expect(rejected(svg('<image href="https://evil.example/x.png"/>'))).toMatch(/href/);
    expect(rejected(svg('<image xlink:href="http://evil.example/x.png"/>'))).toMatch(/href/);
    expect(rejected(svg('<a href="javascript:alert(1)"><rect/></a>'))).toMatch(/href/);
    expect(rejected(svg('<use href="other.svg#r"/>'))).toMatch(/href/);
    expect(rejected(svg('<image href="data:text/html;base64,PHNjcmlwdD4="/>'))).toMatch(/href/);
    expect(rejected(svg('<image href="file:///etc/passwd"/>'))).toMatch(/href/);
  });

  it('rejects animations that rewrite href', () => {
    expect(rejected(svg('<a><set attributeName="href" to="javascript:alert(1)"/></a>'))).toMatch(/set/);
  });

  it('rejects external CSS urls and imports, in style elements and style attributes', () => {
    expect(rejected(svg('<style>@font-face{src:url(https://evil.example/f.woff2)}</style>'))).toMatch(/url/);
    expect(rejected(svg('<rect style="fill:url(http://evil.example/p)"/>'))).toMatch(/url/);
    expect(rejected(svg('<style>@import "https://evil.example/x.css";</style>'))).toMatch(/import/);
    expect(rejected(svg('<style>.a{background:url( "//evil.example/p" )}</style>'))).toMatch(/url/);
  });

  it('rejects external references in any attribute, not only href and style', () => {
    for (const attr of ['fill', 'filter', 'mask', 'clip-path', 'marker-end', 'stroke']) {
      expect(rejected(svg(`<rect ${attr}="url(https://tracker.example/p.svg#a)"/>`)), attr).toMatch(/url|external/);
    }
    expect(rejected(svg('<rect data-x="https://tracker.example/q"/>'))).toMatch(/external/);
    expect(rejected(svg('<g xml:base="https://evil.example/"><use href="#r"/></g>'))).toMatch(/xml:base/);
  });

  it('rejects CSS tricks: quoted URLs with apostrophes, escapes and image-set', () => {
    expect(rejected(svg(`<style>.a{background:url("https://evil.example/a'b")}</style>`))).toMatch(/url|external/);
    expect(rejected(svg('<style>.a{background:\\75rl(https://evil.example/x)}</style>'))).toMatch(/escape/);
    expect(rejected(svg('<style>.a{background:image-set("https://evil.example/x.png" 1x)}</style>'))).toMatch(/image-set|external/);
    expect(rejected(svg('<rect style="fill:url(\'//evil.example/p\')"/>'))).toMatch(/url/);
  });

  it('still accepts the repository sketch and safe fragment references in presentation attributes', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const sketch = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'oms-knowledge-base', 'storyboards', 'order-lifecycle', 'place-and-fill-order', 'assets', 'submit-order.excalidraw.svg'), 'utf8');
    expect(checkSvg(sketch, MAX)).toEqual({ ok: true });
    expect(checkSvg(svg('<defs><linearGradient id="g"/></defs><rect fill="url(#g)" clip-path="url( \'#c\' )"/>'), MAX)).toEqual({ ok: true });
  });

  it('rejects DOCTYPE and entity declarations', () => {
    expect(rejected(`<!DOCTYPE svg [<!ENTITY x "y">]>${svg('<text>&x;</text>')}`)).toMatch(/DOCTYPE/);
  });

  it('rejects content over the size limit, malformed XML and non-svg roots', () => {
    expect(rejected(svg('<rect/>'), 20)).toMatch(/larger/);
    expect(rejected('<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>')).toMatch(/XML/);
    expect(rejected('<html xmlns="http://www.w3.org/1999/xhtml"></html>')).toMatch(/svg/);
    expect(rejected('')).toBeTruthy();
  });

  it('rejects XHTML-namespaced elements anywhere', () => {
    expect(rejected(svg('<div xmlns="http://www.w3.org/1999/xhtml">x</div>'))).toMatch(/namespace/);
    expect(rejected(svg('<iframe xmlns="http://www.w3.org/1999/xhtml" src="x"/>'))).toMatch(/iframe/);
  });
});
