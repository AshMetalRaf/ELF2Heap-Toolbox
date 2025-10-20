function stringToEndianHex(str, endian = 'big') {
    const hexBytes = Array.from(str, c => c.charCodeAt(0).toString(16).padStart(2, '0'));
    while (hexBytes.length % 4 !== 0) hexBytes.push("00");

    const chunks = [];
    for (let i = 0; i < hexBytes.length; i += 4) {
        let bytes = hexBytes.slice(i, i + 4);
        if (endian === 'little') bytes = bytes.reverse();
        chunks.push("0x" + bytes.join(''));
    }

    return chunks.join(", ");
}

document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.panel').forEach(p => {
            if (p.id === tab) {
                p.classList.remove('hidden');
                p.setAttribute('aria-hidden', 'false');
            } else {
                p.classList.add('hidden');
                p.setAttribute('aria-hidden', 'true');
            }
        });
    });
});

/* converter tab  */
const inputEl = document.getElementById('input');
const outputEl = document.getElementById('output');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const endianSelect = document.getElementById('endianSelect');

function convertLines() {
    const endian = endianSelect.value;
    const lines = inputEl.value.split(/\r?\n/);
    const out = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        out.push(`${trimmed} = ${stringToEndianHex(trimmed, endian)}`);
    }
    outputEl.textContent = out.join('\n');
}

inputEl.addEventListener('input', convertLines);
endianSelect.addEventListener('change', convertLines);

convertLines();

function flash(el, text = 'Copied!', ms = 1200) {
    const old = el.textContent;
    el.textContent = text;
    setTimeout(() => el.textContent = old, ms);
}

function copyText(text, button) {
    if (!text) { alert('Nothing to copy'); return; }
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => flash(button, 'Copied!')).catch(() => fallbackCopy(text, button));
    } else {
        fallbackCopy(text, button);
    }
}

// fallback, prob not needed but just in case
function fallbackCopy(text, button) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
        document.execCommand('copy');
        flash(button, 'Copied!');
    } catch (e) {
        alert('Copy failed');
    }
    document.body.removeChild(ta);
}

copyBtn.addEventListener('click', () => copyText(outputEl.textContent, copyBtn));

downloadBtn.addEventListener('click', () => {
    const txt = outputEl.textContent;
    if (!txt) { alert('Nothing to download'); return; }
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = `${endianSelect.value}_endian_output.txt`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});

/* ascii aligner tab  */
const alignInputEl = document.getElementById('alignInput');
const alignOutputEl = document.getElementById('alignOutput');
const copyAlignBtn = document.getElementById('copyAlignBtn');
const downloadAlignBtn = document.getElementById('downloadAlignBtn');

function alignLines() {
    const padChar = "\u00A0"; // alt+255 non breaking space so it works with RA code notes
    const lines = alignInputEl.value.split(/\r?\n/).filter(Boolean);
    if (!lines.length) {
        alignOutputEl.value = '';
        return;
    }

    let maxLen = 0;
    lines.forEach(l => {
        const parts = l.split("=");
        if (parts[0].trim().length > maxLen) maxLen = parts[0].trim().length;
    });

    const aligned = lines.map(l => {
        let [left, right] = l.split("=");
        if (!right) right = "";
        left = left.trim();
        right = right.trim();
        const padding = padChar.repeat(maxLen - left.length + 1);
        return left + padding + "= " + right;
    });

    alignOutputEl.value = aligned.join("\n");
}

alignInputEl.addEventListener('input', alignLines);

copyAlignBtn.addEventListener('click', () => copyText(alignOutputEl.value, copyAlignBtn));
downloadAlignBtn.addEventListener('click', () => {
    const txt = alignOutputEl.value;
    if (!txt) { alert('Nothing to download'); return; }
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aligned.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});

alignLines();

const dumpTab = document.getElementById('dump');
if (dumpTab) {
    const startAddrEl = dumpTab.querySelector('#startAddr');
    const endAddrEl = dumpTab.querySelector('#endAddr');
    const incrementEl = dumpTab.querySelector('#increment');
    const firstCounterEl = dumpTab.querySelector('#firstCounter');
    const dumpTextEl = dumpTab.querySelector('#dumpText');

    const generateDumpBtn = dumpTab.querySelector('#generateDumpBtn');
    const dumpOutputEl = dumpTab.querySelector('#dumpOutput');
    const copyDumpBtn = dumpTab.querySelector('#copyDumpBtn');
    const downloadDumpBtn = dumpTab.querySelector('#downloadDumpBtn');

    function parseHexOrFail(s) {
        if (typeof s === 'number') return s;
        const cleaned = s.toString().replace(/\s+/g, '').replace(/^0x/i, '');
        const n = parseInt(cleaned, 16);
        return Number.isNaN(n) ? NaN : n;
    }

    function generateDump() {
        const start = parseHexOrFail(startAddrEl.value) || 0;
        const end = parseHexOrFail(endAddrEl.value) || 0;
        const inc = parseHexOrFail(incrementEl.value) || 1;
        let counter = Number(firstCounterEl.value) || 1;

        if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(inc) || inc <= 0) {
            alert('Please provide valid hex start/end and a positive hex increment (e.g. 0x0C)');
            return;
        }

        const template = 'N0:0x{addr}:"{text}"';
        const texts = dumpTextEl.value.split(/\r?\n/).map(t => t.trim()).filter(Boolean);
        if (texts.length === 0) texts.push('[32-bit] Example');

        const lines = [];
        let addr = start;
        let ti = 0;

        while (addr <= end) {
            const rawText = texts[ti % texts.length];
            const addrHex = addr.toString(16).padStart(8, '0');

            const textWithCounter = `${rawText} ${counter}`;
            const line = template
                .replace(/{addr}/g, addrHex)
                .replace(/{text}/g, textWithCounter);

            lines.push(line);

            addr += inc;
            counter += 1;
            ti += 1;

            if (lines.length > 1000000) {
                alert('Too many lines — aborted');
                break;
            }
        }

        dumpOutputEl.textContent = lines.join('\n');
    }

    generateDumpBtn.addEventListener('click', generateDump);
    copyDumpBtn.addEventListener('click', () => copyText(dumpOutputEl.textContent, copyDumpBtn));
    downloadDumpBtn.addEventListener('click', () => {
        const txt = dumpOutputEl.textContent;
        if (!txt) { alert('Nothing to download'); return; }
        const blob = new Blob([txt], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dump.txt';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    });
}


// =================================================================================
// ps2 elf logic
// =================================================================================

function hex(x, pad = 8) {
    return '0x' + x.toString(16).toUpperCase().padStart(pad, '0');
}

function toUint32BE(bytes) {
    return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | (bytes[3]);
}

const fileInput = document.getElementById('file');
const elfResultDiv = document.getElementById('elfResult');
const mipsResultDiv = document.getElementById('mipsResult');
const mipsTextarea = document.getElementById('mipsBlock');

function isValidElfFilename(filename) {
    const pattern = /^(SLUS|SLES)_[0-9]+\.[0-9]{2}$/i;
    return pattern.test(filename);
}

function resetElfUI() {
    fileInput.value = "";
    elfResultDiv.style.display = 'none';
    const elfStep2Header = document.getElementById('elfStep2Header');
    if (elfStep2Header) elfStep2Header.style.display = 'none';
    const step3 = document.getElementById('step3');
    if (step3) step3.style.display = 'none';
    const exampleBtn = document.querySelector('.example-toggle');
    if (exampleBtn) exampleBtn.style.display = 'none';
}

if (fileInput && elfResultDiv) {
    fileInput.addEventListener('change', () => {
        const f = fileInput.files[0];
        if (!f) return;

        if (!isValidElfFilename(f.name)) {
            alert("Invalid file name!\nExpected something like SLUS_214.90 or SLES_123.45.");
            resetElfUI();
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const view = new Uint8Array(reader.result);
            if (view.length < 0x1C) { alert('File too small'); return; }

            const bytes = [view[0x18], view[0x19], view[0x1A], view[0x1B]];
            const be = toUint32BE(bytes);
            const mapped = be;
            const reversedHex = bytes.slice().reverse().map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');

            const out = [];
            out.push(`<div><strong>ELF bytes @0x18:</strong> <code>${bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}</code></div>`);
            out.push(`<div><strong>Load address:</strong> <code>${hex(be)}</code></div>`);
            out.push(`<div><strong>Mapped PCSX2 EE RAM address:</strong> 
                <code style="color:white">${hex(mapped)}</code>
                <em>This is the ELF load address in the BIOS/system region.</em>
                <button class="copy" data-text="${reversedHex}">Copy</button></div>`);

            elfResultDiv.innerHTML = out.join('');
            elfResultDiv.style.display = 'block';

            const elfStep2Header = document.getElementById('elfStep2Header');
            if (elfStep2Header) elfStep2Header.style.display = 'block';

            const step3 = document.getElementById('step3');
            if (step3) step3.style.display = 'block';

            const exampleBtn = document.querySelector('.example-toggle');
            if (exampleBtn) exampleBtn.style.display = 'inline-block';
        };
        reader.readAsArrayBuffer(f);
    });
}


if (mipsTextarea && mipsResultDiv) {
    function computeSyscallArguments(mipsText, targetSyscallID) {
        const lines = mipsText.split('\n').map(l => l.trim());
        const registers = { a0: null, a1: null, a2: null, a3: null, gp: null, sp: null, v0: null, t0: null };
        const results = { a0: null, a1: null, a2: null, a3: null, gp: null, sp: null, v0: null, t0: null, found: false };

        const captureAddressInstructions = (reg, startIndex, maxLinesBack) => {
            let luiUpper = null;
            let addiuLower = null;

            for (let k = startIndex - 1; k >= 0 && (startIndex - k) <= maxLinesBack; k--) {
                const line = lines[k].toLowerCase();
                if (line.includes('syscall')) break;

                const luiMatch = line.match(new RegExp(`lui\\s+${reg},0x([0-9a-f]{1,4})`, 'i'));
                if (luiMatch) {
                    luiUpper = parseInt(luiMatch[1], 16);
                }

                const addiuMatch = line.match(new RegExp(`addiu\\s+${reg},${reg},(-?0x[0-9a-f]+)`, 'i'));
                if (addiuMatch) {
                    addiuLower = parseInt(addiuMatch[1], 16);
                }
            }

            return { luiUpper, addiuLower };
        };

        const findCodeBlock = (targetId) => {
            const startRegex = /lui a0,0x[0-9a-f]{1,4}/i;
            const endRegex = new RegExp(`addiu v1,zero,0x${targetId.toString(16)}\\s*\\n?syscall`, 'i');

            let startIndex = -1;
            let endIndex = -1;

            const tempLines = mipsText.split('\n');

            if (targetId === 0x3C) {
                for (let i = 0; i < tempLines.length; i++) {
                    if (tempLines[i].match(startRegex)) {
                        startIndex = i;
                        break;
                    }
                }
            } else {
                let firstSyscallFound = false;
                for (let i = 0; i < tempLines.length; i++) {
                    if (!firstSyscallFound && tempLines[i].toLowerCase().includes('syscall')) {
                        firstSyscallFound = true;
                    }
                    if (firstSyscallFound && tempLines[i].match(startRegex)) {
                        startIndex = i;
                        break;
                    }
                }
            }

            for (let i = (startIndex !== -1 ? startIndex : 0); i < tempLines.length; i++) {
                if (tempLines[i].toLowerCase().includes('syscall')) {
                    const prevLine = tempLines[i - 1] || '';
                    if (prevLine.match(new RegExp(`addiu v1,zero,0x${targetId.toString(16)}`, 'i'))) {
                        endIndex = i;
                        break;
                    }
                }
            }

            if (startIndex !== -1 && endIndex !== -1) {
                return tempLines.slice(startIndex, endIndex + 1).map(line => line.trim()).join('\n');
            }
            return null;
        }


        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase();

            const matchLUI = line.match(/lui\s+(a[0-3]|t0|gp),0x([0-9a-f]{1,4})/i);
            if (matchLUI) {
                const reg = matchLUI[1];
                registers[reg] = parseInt(matchLUI[2], 16) << 16;
            }

            const matchADDIU = line.match(/addiu\s+(a[0-3]|t0|gp|sp),(a[0-3]|t0|gp|v0|zero),(-?0x[0-9a-f]+)/i);
            if (matchADDIU) {
                const destReg = matchADDIU[1];
                const srcReg = matchADDIU[2];
                const offset = parseInt(matchADDIU[3], 16);

                if (registers[srcReg] !== null && registers[srcReg] !== undefined) {
                    registers[destReg] = (registers[srcReg] + offset) >>> 0;
                } else if (srcReg === 'zero') {
                    registers[destReg] = (0 + offset) >>> 0;
                } else if (srcReg === 'v0' && registers.v0 !== null) {
                    registers[destReg] = (registers.v0 + offset) >>> 0;
                }
            }

            const matchDADDU = line.match(/daddu\s+(gp|sp|a[0-3]),(a[0-3]|v0),zero/i);
            if (matchDADDU) {
                const destReg = matchDADDU[1];
                const srcReg = matchDADDU[2];
                if (registers[srcReg] !== null && registers[srcReg] !== undefined) {
                    registers[destReg] = registers[srcReg];
                } else if (srcReg === 'v0') {
                }
            }

            if (line.includes('syscall')) {
                const prevLine = lines[i - 1] || '';
                const v1Match = prevLine.match(/addiu\s+v1,zero,0x([0-9a-f]{1,2})/i);

                if (v1Match) {
                    const id = parseInt(v1Match[1], 16);

                    if (id === 0x3C) {
                        registers.v0 = registers.a1;
                    }

                    if (id === targetSyscallID) {
                        results.a0 = registers.a0;
                        results.a1 = registers.a1;
                        results.a2 = registers.a2;
                        results.a3 = registers.a3;
                        results.gp = registers.gp;
                        results.sp = registers.sp;
                        results.t0 = registers.t0;
                        results.found = true;

                        results.a0_instr = captureAddressInstructions('a0', i, 5);
                        results.a1_instr = captureAddressInstructions('a1', i, 5);
                        results.codeBlock = findCodeBlock(targetSyscallID);

                        return results;
                    }

                    if (id === 0x3C) {
                        const postSyscallLine = lines[i + 1] || '';
                        if (postSyscallLine.toLowerCase().match(/daddu\s+sp,v0,zero/i)) {
                            registers.sp = registers.v0;
                        }
                    }
                }
            }
        }

        return results;
    }

    mipsTextarea.addEventListener('input', () => {
        const mipsText = mipsTextarea.value;
        const base3C = computeSyscallArguments(mipsText, 0x3C);
        const base3D = computeSyscallArguments(mipsText, 0x3D);

        const explanationContent = document.querySelector('.explanation-content');
        const explanationBtn = document.querySelector('.explanation-toggle');

        const dynamicBase = base3D.a0;

        if (mipsText.trim().length > 0) {
            explanationBtn.style.display = 'inline-block';
        } else {
            explanationBtn.style.display = 'none';
            explanationContent.innerHTML = '';
        }

        if (dynamicBase !== null && base3D.found) {
            const isHeap = (dynamicBase >= 0x00100000 && dynamicBase <= 0x01FFFFFF);

            mipsResultDiv.innerHTML = `<div><strong>Computed Dynamic Heap Base (0x3D):</strong> 
                <code style="color:${isHeap ? '#00FF00' : 'red'}">${hex(dynamicBase)}</code> 
                ${isHeap ? '<em>is the start of dynamic memory (heap)</em>' : '<em>Possibly BIOS/system region</em>'}</div>`;
            mipsResultDiv.style.display = 'block';

            let explanation = `
<h3>Memory Setup Breakdown:</h3>
<p>The code sets up memory regions on the PS2's EE RAM (starting at <strong>0x00100000</strong>). Addresses are built using a two-instruction sequence:</p>
<ol>
    <li>lui (Load Upper Immediate): Loads the upper 16 bits of the 32-bit address.</li>
    <li>addiu (Add Immediate Unsigned): Adds the lower 16 bits (or an offset) to complete the full 32-bit address.</li>
</ol>
<hr>
`;

            if (base3C.found) {
                const a0_val = base3C.a0 ? hex(base3C.a0) : 'N/A';
                const a1_val = base3C.a1 ? hex(base3C.a1) : 'N/A';
                const a2_val = base3C.a2 ? hex(base3C.a2) : 'N/A';
                const a3_val = base3C.a3 ? hex(base3C.a3) : 'N/A';
                const gp_val = base3C.gp ? hex(base3C.gp) : 'N/A';
                const t0_val = base3C.t0 ? hex(base3C.t0) : 'N/A';

                explanation += `
<h4>1. Syscall 0x3C (Stack Setup)</h4>
<p>This call sets up the entire execution environment and the stack, which defines the starting state.</p>
<pre style="background:#1B1B1B;padding:10px;border-radius:6px;overflow-x:auto;">${base3C.codeBlock.split('\n').map(line => `<code style="color:#E055E0">${line}</code>`).join('\n')}</pre>
<ul>
<li><strong>Argument a0:</strong> <code style="color:yellow">${a0_val}</code>. Often the base address for game code or internal data structures.</li>
<li><strong>Argument a1:</strong> <code style="color:yellow">${a1_val}</code>. Defines the stack boundary.</li>
<li><strong>Argument a2:</strong> <code style="color:yellow">${a2_val}</code>. Defines the size or other init parameters.</li>
<li><strong>Argument a3:</strong> <code style="color:yellow">${a3_val}</code>. The address of the game's main function which is the entry point.</li>
<li><strong>Temporary Register (t0):</strong> <code style="color:yellow">${t0_val}</code>. Likely pointing to a fixed global address in EE RAM (main memory) and used for game setup or internal pointers.</li>
<li>Global Pointer (gp): <code style="color:yellow">${gp_val}</code>. Set to the a0 value (e.g. daddu gp,a0,zero) to access global variables.</li>
<li>Stack Pointer (sp): Set by the system return value (v0) immediately after the syscall.</li>
</ul>
<hr>
`;
            }

            if (base3D.found) {
                const a0_val = hex(base3D.a0);
                const a1_val = base3D.a1 ? hex(base3D.a1) : 'N/A';

                let a0_calc = 'N/A';
                if (base3D.a0_instr.luiUpper !== null) {
                    a0_calc = `(0x${base3D.a0_instr.luiUpper.toString(16).toUpperCase()} << 16) + 0x${base3D.a0_instr.addiuLower.toString(16).toUpperCase().replace('-', '')} = <strong>${a0_val}</strong>`;
                }

                explanation += `
<h4>2. Syscall 0x3D (Dynamic Heap Setup - SetSysMemory)</h4>
<p>This is the definitive call for setting the game's dynamic memory heap. This is the memory area used for runtime allocation (like the C language malloc).</p>
<pre style="background:#1B1B1B;padding:10px;border-radius:6px;overflow-x:auto;">${base3D.codeBlock.split('\n').map(line => `<code style="color:#E055E0">${line}</code>`).join('\n')}</pre>
<ul>
<li><strong>Argument a0 (Heap Start Base):</strong> <code style="color:lime">${a0_val}</code>. This is your dynamic memory base address.
    <br>→ Calculation: ${a0_calc}</li>
<li><strong>Argument a1 (Heap End/Size):</strong> <code style="color:lime">${a1_val}</code>. This defines the end boundary of the heap.</li>
</ul>
<hr>
`;
            }


            explanation += `
<p><strong>Memory Tip:</strong> PS2 EE RAM spans from <strong>0x00100000</strong> up to <strong>0x01FFFFFF</strong> (32MB). If the calculated addresses are in this range, they're valid memory locations.</p>
`;

            explanationContent.innerHTML = explanation;
        } else {
            mipsResultDiv.style.display = 'none';
            explanationContent.innerHTML = '';
        }
    });
}

document.addEventListener('click', e => {
    if (e.target.classList.contains('example-toggle')) {
        const wrapper = e.target.nextElementSibling;
        wrapper.classList.toggle('show');
        e.target.textContent = wrapper.classList.contains('show')
            ? 'Hide example instructions'
            : 'Show example instructions';
    }

    if (e.target.classList.contains('explanation-toggle')) {
        const wrapper = e.target.nextElementSibling;
        const isShowing = wrapper.classList.contains('show');

        if (!isShowing) {
            wrapper.style.maxHeight = wrapper.scrollHeight + "px";
            wrapper.classList.add('show');
            e.target.textContent = 'Hide Memory Analysis';
        } else {
            wrapper.style.maxHeight = wrapper.scrollHeight + "px";
            requestAnimationFrame(() => {
                wrapper.style.maxHeight = "0px";
            });
            wrapper.classList.remove('show');
            e.target.textContent = 'Show Memory Analysis';
        }
    }

    if (e.target.classList.contains('copy')) {
        const text = e.target.dataset.text;
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                e.target.textContent = 'Copied';
                setTimeout(() => e.target.textContent = 'Copy', 900);
            }).catch(() => fallbackCopy(text, e.target));
        } else fallbackCopy(text, e.target);
    }
});

function fallbackCopy(text, btn) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = 0;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        btn.textContent = 'Copied';
        setTimeout(() => btn.textContent = 'Copy', 900);
    } catch (err) {
        alert('Copy failed: ' + err);
    }
    document.body.removeChild(textarea);
}

// =================================================================================
// Memory Mapping Tab, sourced from: https://github.com/RetroAchievements/rcheevos
// =================================================================================

const memoryMappings = {
    '3DO': `
CPU: ARM60
0x000000-0x1FFFFF: Main RAM (2MB)
`,
    'Amiga': `
CPU: Motorola 68000
0x000000-0x07FFFF: Main RAM (Chip RAM, 512KB)
0x080000-0x0FFFFF: Extended RAM (Chip RAM, additional 512KB)
`,
    'Amstrad CPC': `
CPU: Zilog Z80A
0x0000-0x003F: Firmware
0x0040-0xB0FF: System RAM
0x0B100-0x0BFFF: Stack and Firmware Data
0x0C000-0x0FFFF: Screen Memory
0x010000-0x08FFFF: Extended RAM
`,
    'Apple II': `
CPU: MOS Technology 6502
0x0000-0xFFFF: Main RAM
0x010000-0x01FFFF: Auxillary RAM
`,
    'Arcadia 2001': `
CPU: Signetics 2650A
0x0000-0x00FF: System RAM (Bank 3)
0x0100-0x01FF: I/O Area
0x0200-0x02FF: System RAM (Bank 4)
`,
    'Arduboy': `
CPU: Atmel AVR (ATmega32u4)
0x0000-0x00FF: Registers
0x0100-0x0AFF: System RAM (2.5KB)
0x0B00-0x0EFF: EEPROM
`,
    'Atari 2600': `
CPU: MOS Technology 6507
0x0000-0x007F: System RAM (128 Bytes)
`,
    'Atari 7800': `
CPU: MOS Technology 6502C
0x0000-0x17FF: Hardware Interface
0x1800-0x27FF: System RAM
0x2800-0x2FFF: Mirrored RAM
0x3000-0x37FF: Mirrored RAM
0x3800-0x3FFF: Mirrored RAM
0x4000-0x7FFF: Cartridge RAM (Save RAM)
0x8000-0xFFFF: Cartridge ROM
`,
    'Atari Jaguar': `
CPU: Motorola 68000 / Custom DSPs
0x000000-0x1FFFFF: System RAM (2MB DRAM)
`,
    'Atari Lynx': `
CPU: MOS Technology 65SC02
0x0000-0x00FF: Zero Page
0x0100-0x01FF: Stack
0x0200-0x0FBFF: System RAM
0x0FC00-0x0FCFF: SUZY hardware access
0x0FD00-0x0FDFF: MIKEY hardware access
0x0FE00-0x0FFF7: Boot ROM
0x0FFF8-0x0FFFF: Hardware vectors
`,
    'ColecoVision': `
CPU: Zilog Z80A
0x0000-0x03FF: System RAM (Main)
0x0400-0x23FF: SGM Low RAM (Virtual)
0x2400-0x83FF: SGM High RAM (Virtual)
`,
    'Commodore 64': `
CPU: MOS Technology 6510
0x0000-0x03FF: Kernel RAM
0x0400-0x07FF: Screen RAM
0x0800-0x09FFF: System RAM
0x0A000-0x0BFFF: System RAM
0x0C000-0x0CFFF: System RAM
0x0D000-0x0DFFF: System RAM
0x0E000-0x0FFFF: System RAM
`,
    'Dreamcast': `
CPU: Hitachi SH-4
0x00000000-0x00FFFFFF: System RAM (16MB)
`,
    'Elektor TV Games Computer': `
CPU: Signetics 2650
0x0000-0x13FF: System RAM
0x1400-0x14FF: Unused (Mirror)
0x1500-0x16FF: I/O Area
0x1700-0x17FF: System RAM
`,
    'Fairchild Channel F': `
CPU: Fairchild F8
0x00000000-0x0000003F: System RAM (Registers)
0x00000040-0x0000083F: Video RAM
0x00000840-0x0001083F: Cartridge RAM
0x00010840-0x00010C3F: F2102 RAM
`,
    'Famicom Disk System': `
CPU: Ricoh 2A03 (NES-compatible)
0x0000-0x07FF: System RAM
0x0800-0x0FFF: Mirror RAM
0x1000-0x17FF: Mirror RAM
0x1800-0x1FFF: Mirror RAM
0x2000-0x2007: PPU Register
0x2008-0x3FFF: Mirrored PPU Register
0x4000-0x4017: APU and I/O register
0x4018-0x401F: APU and I/O test register
0x4020-0x40FF: FDS I/O registers
0x4100-0x5FFF: Cartridge data (Readonly)
0x6000-0xDFFF: FDS RAM
0xE000-0xFFFF: FDS BIOS ROM (Readonly)
`,
    'GameBoy': `
CPU: Sharp LR35902
0x0000-0x00FF: Interrupt vector
0x0100-0x014F: Cartridge header (Readonly)
0x0150-0x3FFF: Cartridge ROM (fixed)
0x4000-0x7FFF: Cartridge ROM (paged)
0x8000-0x97FF: Tile RAM
0x9800-0x9BFF: BG1 map data
0x9C00-0x9FFF: BG2 map data
0xA000-0xBFFF: Cartridge RAM (Bank 0)
0xC000-0xCFFF: System RAM (fixed)
0xD000-0xDFFF: System RAM (fixed)
0xE000-0xFDFF: Echo RAM
0xFE00-0xFE9F: Sprite RAM
0xFEA0-0xFEFF: Unused
0xFF00-0xFF7F: Hardware I/O
0xFF80-0xFFFE: Quick RAM
0xFFFF-0xFFFF: Interrupt enable
0x010000-0x015FFF: Unused (GBC exclusive)
0x016000-0x033FFF: Cartridge RAM (Banks 1-15)
`,
    'MegaDuck': `
CPU: Sharp LR35902
0x0000-0x00FF: Interrupt vector
0x0100-0x014F: Cartridge header (Readonly)
0x0150-0x3FFF: Cartridge ROM (fixed)
0x4000-0x7FFF: Cartridge ROM (paged)
0x8000-0x97FF: Tile RAM
0x9800-0x9BFF: BG1 map data
0x9C00-0x9FFF: BG2 map data
0xA000-0xBFFF: Cartridge RAM (Bank 0)
0xC000-0xCFFF: System RAM (fixed)
0xD000-0xDFFF: System RAM (fixed)
0xE000-0xFDFF: Echo RAM
0xFE00-0xFE9F: Sprite RAM
0xFEA0-0xFEFF: Unused
0xFF00-0xFF7F: Hardware I/O
0xFF80-0xFFFE: Quick RAM
0xFFFF-0xFFFF: Interrupt enable
0x010000-0x015FFF: Unused (GBC exclusive)
0x016000-0x033FFF: Cartridge RAM (Banks 1-15)
`,
    'GameBoy Color': `
CPU: Sharp LR35902
0x0000-0x00FF: Interrupt vector
0x0100-0x014F: Cartridge header (Readonly)
0x0150-0x3FFF: Cartridge ROM (fixed)
0x4000-0x7FFF: Cartridge ROM (paged)
0x8000-0x97FF: Tile RAM
0x9800-0x9BFF: BG1 map data
0x9C00-0x9FFF: BG2 map data
0xA000-0xBFFF: Cartridge RAM (Bank 0)
0xC000-0xCFFF: System RAM (Bank 0)
0xD000-0xDFFF: System RAM (Bank 1)
0xE000-0xFDFF: Echo RAM
0xFE00-0xFE9F: Sprite RAM
0xFEA0-0xFEFF: Unused
0xFF00-0xFF7F: Hardware I/O
0xFF80-0xFFFE: Quick RAM
0xFFFF-0xFFFF: Interrupt enable
0x010000-0x015FFF: System RAM (Banks 2-7)
0x016000-0x033FFF: Cartridge RAM (Banks 1-15)
`,
    'GameBoy Advance': `
CPU: ARM7TDMI
0x000000-0x007FFF: System RAM (32KB Internal)
0x008000-0x047FFF: System RAM (256KB External)
0x048000-0x057FFF: Save RAM (64KB Game Pak SRAM)
`,
    'Game Gear': `
CPU: Zilog Z80
0x000000-0x001FFF: System RAM
0x002000-0x009FFF: Cartridge RAM (Save RAM)
`,
    'Intellivision': `
CPU: General Instrument CP1610
0x000000-0x00007F: Video RAM (Padding)
0x000080-0x00027F: STIC Registers
0x000280-0x00047F: Unused
0x000480-0x000DFF: System RAM
0x000E00-0x00107F: Unused
0x001080-0x00407F: Cartridge RAM
0x004080-0x00807F: Unused
0x008080-0x00C07F: Cartridge RAM
0x00C080-0x01007F: Video RAM
0x010080-0x04007F: Cartridge RAM
`,
    'Interton VC 4000': `
CPU: Signetics 2650
0x000000-0x0003FF: Cartridge RAM
0x000400-0x0004FF: I/O Area
0x000500-0x0005FF: System RAM
`,
    'Magnavox Odyssey 2': `
CPU: Intel 8021
0x0000-0x003F: Internal RAM
0x0040-0x013F: External RAM
`,
    'Master System': `
CPU: Zilog Z80
0x000000-0x001FFF: System RAM
0x002000-0x009FFF: Cartridge RAM (Save RAM)
`,
    'MegaDrive': `
CPU: Motorola 68000
0x000000-0x00FFFF: System RAM
0x010000-0x01FFFF: Cartridge RAM (Save RAM)
`,
    'MegaDrive 32X': `
CPU: Dual Hitachi SH-2 / Motorola 68000
0x000000-0x00FFFF: System RAM (Main MegaDrive RAM)
0x010000-0x04FFFF: 32X RAM
0x050000-0x05FFFF: Cartridge RAM (Save RAM)
`,
    'MSX': `
CPU: Zilog Z80
0x000000-0x07FFFF: System RAM (Paged RAM, up to 512KB)
`,
    'MS-DOS': `
CPU: Intel 8086 / 8088 (and later x86 processors)
0x00000000-0x0009FFFF: Game Conventional Memory
0x000A0000-0x000FFFFF: Padding (Reserved)
0x00100000-0x0019FFFF: OS Conventional Memory
0x001A0000-0x001FFFFF: Padding (Reserved)
0x00200000-0x041FFFFF: Expanded Memory (Up to 64MB Mapped)
`,
    'Neo Geo Pocket': `
CPU: Toshiba TLCS-900H
0x000000-0x003FFF: System RAM
`,
    'Neo Geo CD': `
CPU: Motorola 68000
0x000000-0x00F2FF: System RAM (User Work RAM)
0x00F300-0x00FFFF: Reserved RAM (System)
`,
    'NES': `
CPU: Ricoh 2A03
0x0000-0x07FF: System RAM
0x0800-0x0FFF: Mirror RAM
0x1000-0x17FF: Mirror RAM
0x1800-0x1FFF: Mirror RAM
0x2000-0x2007: PPU Register
0x2008-0x3FFF: Mirrored PPU Register
0x4000-0x4017: APU and I/O register
0x4018-0x401F: APU and I/O test register
0x4020-0x5FFF: Cartridge data (Readonly)
0x6000-0x7FFF: Cartridge RAM (Save RAM)
0x8000-0xFFFF: Cartridge ROM (Readonly)
`,
    'Nintendo 64': `
CPU: MIPS R4300i
0x000000-0x1FFFFF: System RAM (RDRAM 1)
0x200000-0x3FFFFF: System RAM (RDRAM 2)
0x400000-0x7FFFFF: System RAM (Expansion Pak)
`,
    'Nintendo DS': `
CPU: Dual ARM7TDMI / ARM946E-S
0x0000000-0x03FFFFF: System RAM (4MB)
0x0400000-0x0FFFFFF: Unused (DSi exclusive padding)
0x1000000-0x1003FFF: Data TCM
`,
    'Nintendo DSi': `
CPU: Dual ARM7TDMI / ARM946E-S
0x0000000-0x0FFFFFF: System RAM (16MB)
0x1000000-0x1003FFF: Data TCM
`,
    'Oric': `
CPU: MOS Technology 6502
0x000000-0x00FFFF: System RAM (Up to 64KB)
`,
    'PC-8800': `
CPU: NEC PD780C (Zilog Z80-compatible)
0x000000-0x00FFFF: Main RAM
0x010000-0x010FFF: Text VRAM
`,
    'PC Engine': `
CPU: Hudson Soft HuC6280
0x000000-0x001FFF: System RAM (8KB)
`,
    'PC Engine CD': `
CPU: Hudson Soft HuC6280
0x000000-0x001FFF: System RAM (8KB)
0x002000-0x011FFF: CD RAM
0x012000-0x041FFF: Super System Card RAM
0x042000-0x0427FF: CD Battery-backed RAM (Save RAM)
`,
    'PC-FX': `
CPU: NEC V810
0x000000-0x1FFFFF: System RAM (2MB)
0x200000-0x207FFF: Internal Backup Memory (Save RAM)
0x208000-0x20FFFF: External Backup Memory (Save RAM)
`,
    'PlayStation': `
CPU: MIPS R3000
0x000000-0x00FFFF: Kernel RAM
0x010000-0x1FFFFF: System RAM
0x200000-0x2003FF: Scratchpad RAM
`,
    'PlayStation 2': `
CPU: Emotion Engine
0x00000000-0x000FFFFF: Kernel RAM
0x00100000-0x01FFFFFF: System RAM
0x02000000-0x02003FFF: Scratchpad RAM
`,
    'PlayStation Portable': `
CPU: MIPS R4000 (Allegrex)
0x00000000-0x007FFFFF: Kernel RAM (32MB/64MB models)
0x00800000-0x01FFFFFF: System RAM (32MB/64MB models)
`,
    'Pokemon Mini': `
CPU: V3085
0x000000-0x000FFF: BIOS RAM
0x001000-0x001FFF: System RAM
`,
    'Sega CD': `
CPU: Motorola 68000 / Custom ASIC
0x000000-0x00FFFF: 68000 RAM (Main Genesis Work RAM)
0x010000-0x08FFFF: CD PRG RAM
0x090000-0x0AFFFF: CD WORD RAM
`,
    'Sega Saturn': `
CPU: Dual Hitachi SH-2
0x000000-0x0FFFFF: Work RAM Low
0x100000-0x1FFFFF: Work RAM High
`,
    'SG-1000': `
CPU: Zilog Z80
0x000000-0x0003FF: System RAM
0x000400-0x001FFF: Extended RAM (Expansion B)
0x002000-0x003FFF: Extended RAM (Expansion A)
0x004000-0x005FFF: Extended RAM (Cartridge)
`,
    'Super Cassette Vision': `
CPU: Epoch Super Cassette Vision CPU (uPD7801G)
0x000000-0x000FFF: System ROM (BIOS, Readonly)
0x001000-0x001FFF: Unused
0x002000-0x003FFF: Video RAM
0x004000-0x007FFFU: Unused
0x008000-0x00FF7F: Cartridge RAM
0x00FF80-0x00FFFF: System RAM
`,
    'Super Nintendo': `
CPU: Ricoh 5A22 (65C816-compatible)
0x000000-0x01FFFF: System RAM (WRAM)
0x020000-0x09FFFF: Cartridge RAM (Save RAM)
0x0A0000-0x0A07FF: I-RAM (SA-1)
`,
    'Thomson TO8': `
CPU: Motorola 6809
0x000000-0x07FFFF: System RAM
`,
    'TI-83': `
CPU: Zilog Z80
0x000000-0x007FFF: System RAM
`,
    'TIC-80': `
CPU: Custom (Emulated)
0x000000-0x003FFF: Video RAM
0x004000-0x005FFF: Tile RAM
0x006000-0x007FFF: Sprite RAM
0x008000-0x00FF7F: MAP RAM
0x00FF80-0x00FF8B: Input State
0x00FF8C-0x014003: Sound RAM
0x014004-0x014403: Persistent Memory (Save RAM)
0x014404-0x014603: Sprite Flags
0x014604-0x014E03: System Font
0x014E04-0x017FFF: System RAM
`,
    'Uzebox': `
CPU: ATMEL AVR 8-bit Microcontroller
0x000000-0x000FFF: System RAM
`,
    'Vectrex': `
CPU: Motorola 68A09
0x000000-0x0003FF: System RAM
`,
    'Virtual Boy': `
CPU: NEC V810
0x000000-0x00FFFF: System RAM (WRAM)
0x010000-0x01FFFF: Cartridge RAM (Save RAM)
`,
    'Watara Supervision': `
CPU: Zilog Z80
0x0000-0x1FFF: System RAM
0x2000-0x3FFF: Registers
0x4000-0x5FFF: Video RAM
`,
    'WASM-4': `
CPU: WebAssembly (WASM)
0x000000-0x00FFFF: System RAM (64KB)
`,
    'Wii': `
CPU: IBM PowerPC Broadway / Hollywood (Graphics)
0x00000000-0x017FFFFF: System RAM (24MB Main RAM)
0x01800000-0x0FFFFFFF: Unused
0x10000000-0x13FFFFFF: System RAM (64MB GDDR3)
`,
    'WonderSwan': `
CPU: NEC V30 MZ
0x000000-0x00FFFF: System RAM (64KB)
0x010000-0x08FFFF: Cartridge RAM (Save RAM)
`,
    'ZX Spectrum': `
CPU: Zilog Z80
0x00000-0x03FFF: Screen RAM (RAM Bank 5 on 128K)
0x04000-0x07FFF: System RAM (RAM Bank 2 on 128K)
0x08000-0x0BFFF: System RAM (RAM Bank 0 on 128K)
0x0C000-0x0FFFF: System RAM (RAM Bank 1 on 128K)
0x10000-0x13FFF: System RAM (RAM Bank 3 on 128K)
0x14000-0x17FFF: System RAM (RAM Bank 4 on 128K)
0x18000-0x1BFFF: System RAM (RAM Bank 6 on 128K)
0x1C000-0x1FFFF: Screen RAM (RAM Bank 7 on 128K)
`,
};

const memTab = document.getElementById('mem');

if (memTab) {
    const btnContainer = document.createElement('div');
    btnContainer.className = 'console-buttons';
    memTab.appendChild(btnContainer);

    const mappingDisplay = document.createElement('pre');
    mappingDisplay.id = 'mappingDisplay';
    memTab.appendChild(mappingDisplay);

    Object.keys(memoryMappings).forEach(consoleName => {
        const btn = document.createElement('button');
        btn.textContent = consoleName;
        btn.addEventListener('click', () => {
            displayMapping(consoleName);
            Array.from(btnContainer.children).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
        btnContainer.appendChild(btn);
    });

    function displayMapping(consoleName) {
        mappingDisplay.textContent = memoryMappings[consoleName];
    }

    const firstConsole = Object.keys(memoryMappings)[0];
    if (firstConsole) displayMapping(firstConsole);

    if (btnContainer.firstChild) {
        btnContainer.firstChild.classList.add('active');
    }
}
