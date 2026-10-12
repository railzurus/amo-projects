#!/usr/bin/env node
/**
 * Сборка ZIP-архива виджета amoCRM без внешних зависимостей.
 *
 *   node scripts/build-widget-zip.js <папка-виджета> <архив.zip>
 *
 * В архив попадают только файлы для amoCRM: manifest.json, script.js, style.css,
 * i18n/, images/ — на первом уровне, с Unix-слешами (i18n/ru.json). Compress-Archive
 * пишет обратные слеши, которые amoCRM не принимает.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const WIDGET_ENTRIES = ['manifest.json', 'script.js', 'style.css', 'i18n', 'images'];

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
});

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (const byte of buf) {
        crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
    return {
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
        date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
}

function collectFiles(root) {
    const files = [];
    const walk = rel => {
        const abs = path.join(root, rel);
        if (fs.statSync(abs).isDirectory()) {
            fs.readdirSync(abs).sort().forEach(name => walk(path.posix.join(rel, name)));
        } else {
            files.push(rel);
        }
    };
    WIDGET_ENTRIES.filter(entry => fs.existsSync(path.join(root, entry))).forEach(walk);
    return files;
}

function buildZip(root, files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const name of files) {
        const data = fs.readFileSync(path.join(root, name));
        const deflated = zlib.deflateRawSync(data, { level: 9 });
        const useDeflate = deflated.length < data.length;
        const payload = useDeflate ? deflated : data;
        const nameBuf = Buffer.from(name, 'utf8');
        const { time, date } = dosDateTime(fs.statSync(path.join(root, name)).mtime);
        const crc = crc32(data);
        const method = useDeflate ? 8 : 0;

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034B50, 0);
        local.writeUInt16LE(20, 4);              // version needed
        local.writeUInt16LE(0x0800, 6);          // флаг UTF-8 имён
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(date, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(payload.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014B50, 0);
        central.writeUInt16LE(0x031E, 4);        // made by: Unix, 3.0
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(time, 12);
        central.writeUInt16LE(date, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(payload.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // права rw-r--r--
        central.writeUInt32LE(offset, 42);

        localParts.push(local, nameBuf, payload);
        centralParts.push(central, nameBuf);
        offset += local.length + nameBuf.length + payload.length;
    }

    const centralDir = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054B50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralDir.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...localParts, centralDir, end]);
}

const [widgetDir, outFile] = process.argv.slice(2);
if (!widgetDir || !outFile) {
    console.error('Usage: node scripts/build-widget-zip.js <widget-dir> <out.zip>');
    process.exit(1);
}
if (!fs.existsSync(path.join(widgetDir, 'manifest.json'))) {
    console.error(`manifest.json not found in ${widgetDir}`);
    process.exit(1);
}

const files = collectFiles(widgetDir);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, buildZip(widgetDir, files));
console.log(`${outFile}: ${files.length} files`);
files.forEach(name => console.log('  ' + name));
