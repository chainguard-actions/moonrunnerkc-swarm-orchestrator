"use strict";
// Helpers over parse-diff output. Each detector walks the same parsed
// diff; centralizing the iteration prevents drift between detectors.
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCommentOnlyLine = isCommentOnlyLine;
exports.fileKind = fileKind;
exports.filePath = filePath;
exports.shouldInspect = shouldInspect;
exports.walkHunks = walkHunks;
exports.isTestFile = isTestFile;
exports.isManifestFile = isManifestFile;
// A line is "comment-only" if its first non-whitespace characters
// open or continue a single-line or block comment. Comments are prose
// describing code, not the code itself — a detector looking for a
// `jest.mock(...)` call should not fire on `// jest.mock('foo') is a
// cheat`. The exact set of opener tokens here covers JS/TS, Python,
// SQL/Lua (--), block comments (/* */), and continuations (*).
const COMMENT_ONLY_RE = /^\s*(\/\/|#|--|\/\*|\*\/|\*(?!\*))/;
function isCommentOnlyLine(content) {
    return COMMENT_ONLY_RE.test(content);
}
const SUPPORTED_FILE_KINDS = ['add', 'modify', 'rename'];
function fileKind(file) {
    if (file.deleted === true)
        return 'delete';
    if (file.new === true)
        return 'add';
    if (file.from !== file.to && file.from !== undefined && file.to !== undefined)
        return 'rename';
    if (file.from !== undefined || file.to !== undefined)
        return 'modify';
    return 'unknown';
}
function filePath(file) {
    return file.to ?? file.from ?? '<unknown>';
}
function shouldInspect(file) {
    const kind = fileKind(file);
    return SUPPORTED_FILE_KINDS.includes(kind);
}
function walkHunks(files) {
    const out = [];
    for (const file of files) {
        if (!shouldInspect(file))
            continue;
        const path = filePath(file);
        for (const chunk of file.chunks) {
            const added = [];
            const deleted = [];
            for (const change of chunk.changes) {
                if (isAdd(change)) {
                    added.push({ file: path, lineNumber: change.ln, content: change.content.slice(1) });
                }
                else if (isDel(change)) {
                    deleted.push({ file: path, lineNumber: change.ln, content: change.content.slice(1) });
                }
            }
            out.push({ file: path, chunk, added, deleted });
        }
    }
    return out;
}
function isAdd(change) {
    return change.type === 'add';
}
function isDel(change) {
    return change.type === 'del';
}
const TEST_FILE_PATTERNS = [
    /(^|\/)__tests__\//,
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /(^|\/)test_[^/]+\.py$/,
    /(^|\/)[^/]+_test\.py$/,
    /(^|\/)tests?\//,
    /(^|\/)[^/]+_test\.go$/,
    /(^|\/)[^/]+\.test\.rs$/,
    /(^|\/)spec\//,
];
function isTestFile(path) {
    return TEST_FILE_PATTERNS.some((re) => re.test(path));
}
function isManifestFile(path) {
    return (path.endsWith('/package.json') ||
        path === 'package.json' ||
        path.endsWith('/go.mod') ||
        path === 'go.mod' ||
        path.endsWith('/requirements.txt') ||
        path === 'requirements.txt' ||
        path.endsWith('/pyproject.toml') ||
        path === 'pyproject.toml' ||
        path.endsWith('/Cargo.toml') ||
        path === 'Cargo.toml');
}
