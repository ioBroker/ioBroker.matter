const ICD_LIT_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">' +
    '<path d="M11.4 2.9C8.9 3.7 7.2 6 7.2 8.8c0 3.7 3 6.7 6.7 6.7 1.7 0 3.3-.6 4.5-1.7-2.4.2-4.6-1-5.9-3s-1.5-4.9-.6-7.5c-.2-.2-.3-.3-.5-.4" ' +
    'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<text x="12" y="22" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="6" font-weight="800" ' +
    'letter-spacing=".15" fill="currentColor">LIT</text></svg>';

/**
 * Moon-with-"LIT" glyph for the Battery Saver Mode indicator. `currentColor` is intentional: the Device
 * Manager inlines `data:image/svg` icons into the DOM, so the indicator colour tints this one asset.
 */
export const ICD_LIT_ICON = `data:image/svg+xml;base64,${Buffer.from(ICD_LIT_SVG, 'utf8').toString('base64')}`;
