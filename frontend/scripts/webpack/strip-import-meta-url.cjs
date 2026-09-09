// A webpack loader for yoga-layout's base64 wasm wrapper: the wrapper reads
// `import.meta.url` only to locate a wasm file it never loads (the binary is
// inline), and webpack would inline that URL as the builder's absolute path.
// The served bundle must name no machine, so the read becomes an empty string.
module.exports = function stripImportMetaUrl(source) {
    return source.replace(/import\.meta\.url/g, '""');
};
