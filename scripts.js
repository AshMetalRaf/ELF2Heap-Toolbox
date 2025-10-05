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
            const base = 0x20000000;
            const mapped = (base + be) >>> 0;
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
        if (!wrapper.classList.contains('show')) {
            wrapper.style.maxHeight = wrapper.scrollHeight + "px";
            wrapper.classList.add('show');
            e.target.textContent = 'Hide Memory Analysis';
        } else {
            wrapper.style.maxHeight = wrapper.scrollHeight + "px";
            requestAnimationFrame(() => { wrapper.style.maxHeight = "0px"; });
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