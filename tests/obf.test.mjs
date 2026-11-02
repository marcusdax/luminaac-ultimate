// Open Board Format import/export (v0.15). Run: node tests/obf.test.mjs
import { toOBF, buildOBZ, readOBZ, unzip, zip, crc32, wordsFromBoard, guessKind, mergeWords, FORMAT } from "../obf-core.js";
import { CORE, FOLDERS } from "../vocab.js";
import { inflateRawSync } from "node:zlib";
import { execFileSync } from "node:child_process";
let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name}`); };
const inflate = async (u8) => new Uint8Array(inflateRawSync(u8));

t("crc32 of 'hello' is the standard value", crc32(new TextEncoder().encode("hello")) === 0x3610a686);
const boards = [{ id: "core", name: "Core words", words: CORE.map(({ w, e, c }) => ({ w, e, c })), cols: 6 },
  ...FOLDERS.map((f) => ({ id: f.id, name: f.label, e: f.e, words: f.words.map(({ w, e, c }) => ({ w, e, c })) }))];
const { manifest, files } = toOBF(boards);
const core = files["boards/core.obf"];
t("manifest points at the core board", manifest.format === FORMAT && manifest.root === "boards/core.obf" && Object.keys(manifest.paths.boards).length === boards.length);
t("core board: every core word plus a link per folder", core.buttons.length === CORE.length + FOLDERS.length && core.buttons.filter((b) => b.load_board).length === FOLDERS.length);
t("grid lists every button once", core.grid.order.flat().filter(Boolean).length === core.buttons.length && core.grid.columns === 6);
t("every button with a picture has an image", core.buttons.every((b) => !b.image_id || core.images.some((i) => i.id === b.image_id)));
t("folder links resolve to boards in the set", core.buttons.filter((b) => b.load_board).every((b) => files[b.load_board.path]));

const obz = buildOBZ(boards);
const py = execFileSync("python3", ["-c", "import sys,zipfile,io;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));print(z.testzip() is None, len(z.namelist()))"], { input: Buffer.from(obz) }).toString().trim();
t("the .obz is a valid zip (python zipfile agrees)", py === `True ${boards.length + 1}`);

const back = await readOBZ(obz, inflate);
t("round trip: root board comes back first", back[0].id === "core" && back.length === boards.length);
t("round trip: words, emoji and kinds survive", back[0].words.length === CORE.length && back[0].words.every((w, i) => w.w === CORE[i].w && w.e === CORE[i].e && w.c === CORE[i].c));

// A deflate-compressed .obz made by another tool.
const other = { format: FORMAT, id: "b1", name: "Snacks", buttons: [{ id: "1", label: "apple", background_color: "rgb(250, 227, 207)" }, { id: "2", label: "eat", vocalization: "eat now", background_color: "rgb(220,239,225)" }, { id: "3", label: "More", load_board: { id: "x" } }, { id: "4", label: "secret", hidden: true }, { id: "5", label: "Apple" }], images: [], grid: { rows: 1, columns: 5, order: [["1", "2", "3", "4", "5"]] } };
const defl = execFileSync("python3", ["-c", "import sys,zipfile,io;b=io.BytesIO();z=zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED);z.writestr('manifest.json','{\"format\":\"open-board-0.1\",\"root\":\"boards/b1.obf\"}');z.writestr('boards/b1.obf',sys.stdin.read());z.close();sys.stdout.buffer.write(b.getvalue())"], { input: JSON.stringify(other) });
const got = await readOBZ(new Uint8Array(defl), inflate);
t("reads deflate-compressed .obz from other apps", got[0].name === "Snacks" && got[0].words.length === 2);
t("uses vocalization, skips folder links, hidden and duplicate buttons", got[0].words.map((w) => w.w).join("|") === "apple|eat now");
t("guesses the kind of word from the colour", got[0].words[0].c === "thing" && got[0].words[1].c === "action" && guessKind("") === "thing");

let threw = ""; try { wordsFromBoard({ nope: 1 }); } catch (e) { threw = e.message; }
t("a non-board file gives a plain message", /isn't an Open Board Format board/.test(threw));
threw = ""; try { await unzip(new Uint8Array(40)); } catch (e) { threw = e.message; }
t("a non-zip gives a plain message", /isn't a zip/.test(threw));

const add = mergeWords([{ w: "pizza", f: "food" }], ["want", "go"], [{ w: "Want", c: "action" }, { w: "pizza", c: "thing" }, { w: "slide", c: "thing" }, { w: "slide", c: "thing" }], "play");
t("merge skips words already there and duplicates", add.length === 1 && add[0].w === "slide" && add[0].f === "play" && add[0].e === "⭐");
const small = zip({ "a.txt": "hi" }), un = await unzip(small);
t("zip/unzip of a tiny file", new TextDecoder().decode(un["a.txt"]) === "hi");
t("an exported .obz of all boards is well under 1 MB", obz.length < 1e6);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
