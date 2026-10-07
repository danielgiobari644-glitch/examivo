// ============================================================================
// EXAMIVO: Export & Print Engine
// Allows saving quizzes as PDF (.pdf), Word (.docx), Plain Text (.txt),
// and printing formatted academic examination papers.
// ============================================================================

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

function getOptionLetter(index) {
    const idx = parseInt(index, 10);
    return !isNaN(idx) && idx >= 0 && idx < 4 ? OPTION_LETTERS[idx] : String(index).toUpperCase();
}

function getCorrectAnswerText(q) {
    if (q.type === 'true-false') {
        return q.answer === 'true' || q.answer === true ? 'True' : 'False';
    }
    const idx = parseInt(q.answer, 10);
    if (!isNaN(idx) && Array.isArray(q.options) && q.options[idx]) {
        return `${OPTION_LETTERS[idx]}. ${q.options[idx]}`;
    }
    return String(q.answer);
}

// ----------------------------------------------------------------------------
// 1. Export as PDF (.pdf)
// Generates a valid standard PDF 1.4 document with multi-page layout,
// candidate box, questions, and official marking scheme.
// ----------------------------------------------------------------------------
export function exportQuizAsPdf(quizData, studentAnswers = null, score = null) {
    const questions = quizData?.questions || [];
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const cleanTitle = (quizData.title || 'Examination').replace(/[^a-zA-Z0-9 _-]/g, '').trim();

    function escapePdf(text) {
        return String(text || '')
            .replace(/\\/g, '\\\\')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)')
            .replace(/[^\x20-\x7E\r\n\t]/g, ' ');
    }

    function wrapText(text, maxChars) {
        const words = String(text || '').split(/\s+/);
        const lines = [];
        let current = '';
        for (const w of words) {
            if (!current) {
                current = w;
            } else if ((current + ' ' + w).length <= maxChars) {
                current += ' ' + w;
            } else {
                lines.push(current);
                current = w;
            }
        }
        if (current) lines.push(current);
        return lines.length > 0 ? lines : [''];
    }

    const pages = [];
    let currentPageLines = [];
    let currentY = 780;
    const bottomMargin = 55;

    function newPage() {
        if (currentPageLines.length > 0) {
            pages.push(currentPageLines);
        }
        currentPageLines = [];
        currentY = 780;
    }

    function addText(text, font, size, x, customY = null) {
        const y = customY !== null ? customY : currentY;
        currentPageLines.push({ text: escapePdf(text), font, size, x, y });
        if (customY === null) {
            currentY -= (size + 4);
            if (currentY < bottomMargin) {
                newPage();
            }
        }
    }

    function addWrappedText(text, font, size, x, maxChars) {
        const lines = wrapText(text, maxChars);
        for (const l of lines) {
            addText(l, font, size, x);
        }
    }

    // Header Block
    addText("EXAMIVO OFFICIAL EXAMINATION PAPER", "/F2", 14, 50);
    addText(cleanTitle, "/F2", 11, 50);
    addText(`Exam: ${quizData.examType || 'Standard'} | Level: ${quizData.academicLevel || 'Standard'} | Board: ${quizData.curriculum || 'Standard'} | Date: ${dateStr}`, "/F1", 8.5, 50);
    currentY -= 6;

    // Candidate Block
    addText("Candidate Name: ____________________________________   Date: __________________", "/F1", 8.5, 50);
    const scoreText = score !== null ? `${score} / ${questions.length}` : "______";
    addText(`Roll No / ID: _______________________________________   Score: ${scoreText} / ${questions.length}`, "/F1", 8.5, 50);
    currentY -= 12;

    // SECTION 1: Questions
    addText(`SECTION 1: EXAMINATION QUESTIONS (${questions.length} Items)`, "/F2", 10.5, 50);
    addText("Instructions: Carefully read each question and select the single best option.", "/F1", 8, 50);
    currentY -= 6;

    questions.forEach((q, i) => {
        if (currentY < 130) newPage();
        
        const qTag = q.subtopic ? ` [${q.subtopic}]` : '';
        addWrappedText(`${i + 1}. ${q.question}${qTag}`, "/F2", 9.5, 50, 78);
        
        if (q.type === 'multiple-choice' || !q.type) {
            const options = Array.isArray(q.options) ? q.options : [];
            options.forEach((opt, optIdx) => {
                const letter = OPTION_LETTERS[optIdx] || String(optIdx + 1);
                addWrappedText(`    [ ] ${letter}. ${opt}`, "/F1", 8.5, 50, 78);
            });
        } else if (q.type === 'true-false') {
            addText(`    [ ] A. True     [ ] B. False`, "/F1", 8.5, 50);
        } else {
            addText(`    Answer: ____________________________________________________`, "/F1", 8.5, 50);
        }
        currentY -= 6;
    });

    // SECTION 2: Answer Key & Marking Guide (Always starts on new page)
    newPage();
    addText("SECTION 2: OFFICIAL MARKING SCHEME & EXPLANATIONS", "/F2", 11, 50);
    addText("Examiner solutions, verified syllabus facts, and high-yield study notes.", "/F1", 8.5, 50);
    currentY -= 10;

    questions.forEach((q, i) => {
        if (currentY < 110) newPage();
        
        const correctStr = getCorrectAnswerText(q);
        addText(`Question ${i + 1}: Correct Answer: ${correctStr}`, "/F2", 9.5, 50);
        
        if (q.explanation) {
            addWrappedText(`Reasoning: ${q.explanation}`, "/F1", 8.5, 50, 78);
        }
        if (q.examinerTip) {
            addWrappedText(`Examiner Tip: ${q.examinerTip}`, "/F1", 8, 50, 78);
        }
        if (studentAnswers && studentAnswers[i]) {
            const stu = studentAnswers[i];
            addText(`Candidate Choice: ${stu.selected} (${stu.isCorrect ? 'CORRECT' : 'INCORRECT'})`, "/F1", 8, 50);
        }
        currentY -= 6;
    });

    if (currentPageLines.length > 0) {
        pages.push(currentPageLines);
    }

    // Build the binary/text PDF 1.4 representation
    const objects = [];
    const xrefs = [];
    let pdfStr = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";

    function pushObject(body) {
        xrefs.push(pdfStr.length);
        const objId = objects.length + 1;
        const entry = `${objId} 0 obj\n${body}\nendobj\n`;
        objects.push(entry);
        pdfStr += entry;
        return objId;
    }

    // 1: Catalog
    const catalogId = pushObject("<< /Type /Catalog /Pages 2 0 R >>");
    
    // 2: Reserve Pages dictionary
    xrefs.push(pdfStr.length);
    const pagesObjIndex = objects.length;
    objects.push("PAGES_PLACEHOLDER");
    const pagesPlaceholderLen = 120; // approximate length reserved
    pdfStr += " ".repeat(pagesPlaceholderLen) + "\n";

    // 3: Font Regular (Helvetica)
    const fontRegularId = pushObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    // 4: Font Bold (Helvetica-Bold)
    const fontBoldId = pushObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

    // Generate Page Objects & Content Streams
    const pageIds = [];
    pages.forEach((pageItems, pIndex) => {
        let stream = "BT\n";
        pageItems.forEach(item => {
            stream += `${item.font} ${item.size} Tf\n`;
            stream += `1 0 0 1 ${item.x} ${item.y} Tm\n`;
            stream += `(${item.text}) Tj\n`;
        });
        // Footer on each page
        stream += `/F1 7.5 Tf\n1 0 0 1 200 25 Tm\n(Page ${pIndex + 1} of ${pages.length} - Generated by EXAMIVO) Tj\n`;
        stream += "ET\n";

        const streamLen = stream.length;
        const streamObjId = pushObject(`<< /Length ${streamLen} >>\nstream\n${stream}endstream`);
        const pageObjId = pushObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents ${streamObjId} 0 R /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> >>`);
        pageIds.push(pageObjId);
    });

    // Replace pages dictionary cleanly by reconstructing string
    let fullPdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
    const finalOffsets = [];

    function addFinalObj(id, body) {
        finalOffsets.push(fullPdf.length);
        fullPdf += `${id} 0 obj\n${body}\nendobj\n`;
    }

    // Obj 1: Catalog
    addFinalObj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    // Obj 2: Pages
    addFinalObj(2, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
    // Obj 3 & 4: Fonts
    addFinalObj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    addFinalObj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

    // Objs 5+: Content Streams & Page definitions
    let curObjId = 5;
    pages.forEach((pageItems, pIndex) => {
        let stream = "BT\n";
        pageItems.forEach(item => {
            stream += `${item.font} ${item.size} Tf\n`;
            stream += `1 0 0 1 ${item.x} ${item.y} Tm\n`;
            stream += `(${item.text}) Tj\n`;
        });
        stream += `/F1 7.5 Tf\n1 0 0 1 200 25 Tm\n(Page ${pIndex + 1} of ${pages.length} - Generated by EXAMIVO) Tj\n`;
        stream += "ET\n";

        const contentId = curObjId++;
        addFinalObj(contentId, `<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
        const pageId = curObjId++;
        addFinalObj(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`);
    });

    const startXref = fullPdf.length;
    fullPdf += `xref\n0 ${finalOffsets.length + 1}\n0000000000 65535 f \n`;
    finalOffsets.forEach(off => {
        const offStr = String(off).padStart(10, '0');
        fullPdf += `${offStr} 00000 n \n`;
    });
    fullPdf += `trailer\n<< /Size ${finalOffsets.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

    // Download blob
    const blob = new Blob([fullPdf], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = `${cleanTitle.replace(/\s+/g, '_') || 'Examivo_Quiz'}.pdf`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ----------------------------------------------------------------------------
// 2. Export as Microsoft Word Document (.docx / .doc)
// ----------------------------------------------------------------------------
export function exportQuizAsDocx(quizData, studentAnswers = null, score = null) {
    const questions = quizData?.questions || [];
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const cleanTitle = (quizData.title || 'Practice Examination').replace(/[^a-zA-Z0-9 _-]/g, '').trim();

    let docHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
        <meta charset='utf-8'>
        <title>${cleanTitle}</title>
        <style>
            body {
                font-family: 'Calibri', 'Arial', sans-serif;
                font-size: 11pt;
                line-height: 1.45;
                color: #111827;
                margin: 1in;
            }
            .header-table {
                width: 100%;
                border-bottom: 2pt solid #4f46e5;
                padding-bottom: 12pt;
                margin-bottom: 18pt;
            }
            .title {
                font-size: 20pt;
                font-weight: bold;
                color: #1e1b4b;
                margin: 0;
            }
            .meta-text {
                font-size: 10pt;
                color: #4b5563;
                margin: 3pt 0;
            }
            .candidate-box {
                margin: 12pt 0 20pt 0;
                padding: 10pt;
                border: 1pt solid #d1d5db;
                background-color: #f9fafb;
            }
            .section-heading {
                font-size: 14pt;
                font-weight: bold;
                color: #4338ca;
                border-bottom: 1pt solid #e5e7eb;
                padding-bottom: 4pt;
                margin-top: 18pt;
                margin-bottom: 12pt;
            }
            .q-block {
                margin-bottom: 14pt;
                page-break-inside: avoid;
            }
            .q-title {
                font-size: 11.5pt;
                font-weight: bold;
                color: #111827;
                margin-bottom: 6pt;
            }
            .q-tag {
                font-size: 9pt;
                font-weight: normal;
                color: #6366f1;
            }
            .options-list {
                list-style-type: none;
                padding-left: 15pt;
                margin: 4pt 0 8pt 0;
            }
            .option-item {
                margin-bottom: 4pt;
            }
            .bubble {
                font-family: monospace;
                font-weight: bold;
                display: inline-block;
                width: 18pt;
            }
            .page-break {
                page-break-before: always;
                margin-top: 30pt;
            }
            .ans-card {
                margin-bottom: 10pt;
                padding: 8pt 10pt;
                background-color: #f8fafc;
                border-left: 3pt solid #10b981;
            }
            .tip-card {
                font-size: 9.5pt;
                color: #92400e;
                background-color: #fef3c7;
                padding: 4pt 8pt;
                margin-top: 4pt;
            }
        </style>
    </head>
    <body>
        <table class="header-table">
            <tr>
                <td>
                    <div style="font-size: 10pt; font-weight: bold; letter-spacing: 2pt; color: #6366f1; text-transform: uppercase;">EXAMIVO ACADEMIC EXAMINATION</div>
                    <div class="title">${cleanTitle}</div>
                    <div class="meta-text"><strong>Target Examination:</strong> ${quizData.examType || 'Standard Exam'} &nbsp;|&nbsp; <strong>Curriculum / Board:</strong> ${quizData.curriculum || 'Standard Board'}</div>
                    <div class="meta-text"><strong>Academic Level:</strong> ${quizData.academicLevel || 'High School / College'} &nbsp;|&nbsp; <strong>Date:</strong> ${dateStr}</div>
                </td>
            </tr>
        </table>

        <div class="candidate-box">
            <table style="width: 100%;">
                <tr>
                    <td style="width: 60%;"><strong>Candidate Name:</strong> ____________________________________</td>
                    <td style="width: 40%;"><strong>Date:</strong> __________________</td>
                </tr>
                <tr>
                    <td style="padding-top: 8pt;"><strong>Candidate ID / Roll No:</strong> ________________________</td>
                    <td style="padding-top: 8pt;"><strong>Score:</strong> ${score !== null ? `${score} / ${questions.length}` : '______ / ' + questions.length}</td>
                </tr>
            </table>
        </div>

        <div class="section-heading">SECTION 1: EXAMINATION QUESTIONS (${questions.length} Items)</div>
        <p style="font-size: 10pt; color: #4b5563; font-style: italic; margin-bottom: 14pt;">Instructions: Carefully read each question and select the single best option.</p>
    `;

    questions.forEach((q, i) => {
        docHtml += `
            <div class="q-block">
                <div class="q-title">${i + 1}. ${q.question} <span class="q-tag">[${q.subtopic || 'General Topic'}]</span></div>
        `;

        if (q.type === 'multiple-choice' || !q.type) {
            const options = Array.isArray(q.options) ? q.options : [];
            docHtml += `<ul class="options-list">`;
            options.forEach((opt, optIdx) => {
                docHtml += `<li class="option-item"><span class="bubble">(&nbsp;&nbsp;) ${OPTION_LETTERS[optIdx] || optIdx + 1}.</span> ${opt}</li>`;
            });
            docHtml += `</ul>`;
        } else if (q.type === 'true-false') {
            docHtml += `
                <ul class="options-list">
                    <li class="option-item"><span class="bubble">(&nbsp;&nbsp;) A.</span> True</li>
                    <li class="option-item"><span class="bubble">(&nbsp;&nbsp;) B.</span> False</li>
                </ul>
            `;
        } else {
            docHtml += `<p style="margin: 8pt 0 14pt 15pt;">Answer: __________________________________________________________________________</p>`;
        }

        docHtml += `</div>`;
    });

    // Page break for official marking guide
    docHtml += `
        <div class="page-break"></div>
        <div class="section-heading">SECTION 2: OFFICIAL MARKING SCHEME & EXPLANATIONS</div>
        <p style="font-size: 10pt; color: #4b5563; font-style: italic; margin-bottom: 14pt;">Examiner solutions, verified syllabus facts, and marking rationales.</p>
    `;

    questions.forEach((q, i) => {
        docHtml += `
            <div class="ans-card">
                <div><strong>Question ${i + 1}:</strong> <span style="color: #047857; font-weight: bold;">Correct: ${getCorrectAnswerText(q)}</span></div>
                <div style="font-size: 10pt; color: #374151; margin-top: 3pt;"><strong>Why this is correct:</strong> ${q.explanation || 'Verified syllabus fact.'}</div>
                ${q.examinerTip ? `<div class="tip-card"><strong>💡 Examiner Tip:</strong> ${q.examinerTip}</div>` : ''}
                ${studentAnswers && studentAnswers[i] ? `
                    <div style="font-size: 9pt; color: #6b7280; margin-top: 3pt;">Candidate Selected: ${studentAnswers[i].selected} (${studentAnswers[i].isCorrect ? 'Correct' : 'Incorrect'})</div>
                ` : ''}
            </div>
        `;
    });

    docHtml += `
        <div style="margin-top: 25pt; border-top: 1pt solid #e5e7eb; padding-top: 8pt; font-size: 9pt; color: #9ca3af; text-align: center;">
            Generated by EXAMIVO &bull; Researched Examination Paper &bull; Saveable as DOCX / Print
        </div>
    </body>
    </html>
    `;

    const blob = new Blob(['\ufeff', docHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = `${cleanTitle.replace(/\s+/g, '_') || 'Examivo_Quiz'}.docx`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ----------------------------------------------------------------------------
// 3. Export as Plain Text (.txt)
// ----------------------------------------------------------------------------
export function exportQuizAsTxt(quizData, studentAnswers = null, score = null) {
    const questions = quizData?.questions || [];
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const cleanTitle = (quizData.title || 'Practice Examination').replace(/[^a-zA-Z0-9 _-]/g, '').trim();

    let txt = `================================================================================\n`;
    txt += `EXAMIVO OFFICIAL EXAMINATION PAPER\n`;
    txt += `Title: ${cleanTitle}\n`;
    txt += `Target Exam: ${quizData.examType || 'Standard Exam'}\n`;
    txt += `Class / Level: ${quizData.academicLevel || 'High School / College'}\n`;
    txt += `Syllabus / Board: ${quizData.curriculum || 'Standard Board'}\n`;
    txt += `Date Generated: ${dateStr}\n`;
    txt += `Total Questions: ${questions.length}\n`;
    if (score !== null) {
        txt += `Student Score: ${score} / ${questions.length} (${Math.round((score / questions.length) * 100)}%)\n`;
    }
    txt += `================================================================================\n\n`;

    txt += `Candidate Name: ____________________________________   Date: __________________\n`;
    txt += `Roll No / ID:   ____________________________________   Score: _________________\n\n`;

    txt += `SECTION 1: EXAMINATION QUESTIONS\n`;
    txt += `Instructions: Answer all questions carefully. Choose the single best answer for each item.\n`;
    txt += `--------------------------------------------------------------------------------\n\n`;

    questions.forEach((q, i) => {
        txt += `Question ${i + 1} [${q.subtopic || 'General Topic'}] (${q.likelihood || 'Common Exam Question'}):\n`;
        txt += `${q.question}\n\n`;

        if (q.type === 'multiple-choice' || !q.type) {
            const options = Array.isArray(q.options) ? q.options : [];
            options.forEach((opt, optIdx) => {
                txt += `   [ ] ${OPTION_LETTERS[optIdx] || optIdx + 1}. ${opt}\n`;
            });
        } else if (q.type === 'true-false') {
            txt += `   [ ] True\n`;
            txt += `   [ ] False\n`;
        } else {
            txt += `   Answer: __________________________________________________\n`;
        }
        txt += `\n`;
    });

    txt += `\n================================================================================\n`;
    txt += `SECTION 2: OFFICIAL ANSWER KEY & MARKING EXPLANATIONS\n`;
    txt += `--------------------------------------------------------------------------------\n\n`;

    questions.forEach((q, i) => {
        txt += `Question ${i + 1}:\n`;
        txt += `   Correct Answer: ${getCorrectAnswerText(q)}\n`;
        txt += `   Why this is correct: ${q.explanation || 'Verified syllabus fact.'}\n`;
        if (q.examinerTip) {
            txt += `   Examiner Tip / Trap: ${q.examinerTip}\n`;
        }
        if (studentAnswers && studentAnswers[i]) {
            const ans = studentAnswers[i];
            txt += `   Student Selected: ${ans.selected} (${ans.isCorrect ? 'CORRECT' : 'INCORRECT'})\n`;
        }
        txt += `\n`;
    });

    txt += `================================================================================\n`;
    txt += `Generated by EXAMIVO - Your Friendly Exam Study Partner\n`;
    txt += `================================================================================\n`;

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = `${cleanTitle.replace(/\s+/g, '_') || 'Examivo_Quiz'}.txt`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ----------------------------------------------------------------------------
// 4. Print Exam Sheet
// Renders an in-page, printable modal preview and opens window.print()
// ----------------------------------------------------------------------------
export function printQuiz(quizData, studentAnswers = null, score = null) {
    const questions = quizData?.questions || [];
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const cleanTitle = (quizData.title || 'Practice Examination').replace(/[^a-zA-Z0-9 _-]/g, '').trim();

    // Check if a print container already exists; remove if so
    let existing = document.getElementById('examivo-print-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'examivo-print-container';
    container.innerHTML = `
        <div class="print-overlay-bar no-print">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="font-weight: 800; font-size: 0.95rem; color: #fff;">📄 Exam Paper Preview</span>
                <span style="font-size: 0.8rem; color: #94a3b8;">(${questions.length} Questions)</span>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                <button id="examivo-trigger-print" class="btn-primary" style="padding: 0.5rem 1rem; font-size: 0.85rem;">
                    🖨️ Print / Save as PDF
                </button>
                <button id="examivo-download-pdf-btn" class="btn-secondary" style="padding: 0.5rem 0.85rem; font-size: 0.85rem;">
                    📥 PDF (.pdf)
                </button>
                <button id="examivo-download-docx-btn" class="btn-secondary" style="padding: 0.5rem 0.85rem; font-size: 0.85rem;">
                    📄 Word (.docx)
                </button>
                <button id="examivo-download-txt-btn" class="btn-secondary" style="padding: 0.5rem 0.85rem; font-size: 0.85rem;">
                    📝 Text (.txt)
                </button>
                <button id="examivo-close-print" class="btn-secondary" style="padding: 0.5rem 0.85rem; font-size: 0.85rem;">
                    ✕ Close
                </button>
            </div>
        </div>

        <div class="exam-paper-sheet">
            <div class="paper-header">
                <div>
                    <span class="paper-badge">EXAMIVO OFFICIAL EXAMINATION</span>
                    <h1 class="paper-title">${cleanTitle}</h1>
                    <div class="paper-meta">
                        Target: <strong>${quizData.examType || 'Standard Exam'}</strong> &bull;
                        Level: <strong>${quizData.academicLevel || 'Standard'}</strong> &bull;
                        Curriculum: <strong>${quizData.curriculum || 'Standard Board'}</strong>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 9pt; color: #64748b;">${dateStr}</div>
                    <div style="font-size: 11pt; font-weight: 800; color: #4f46e5; margin-top: 4px;">${questions.length} Items</div>
                </div>
            </div>

            <div class="paper-candidate-box">
                <table style="width: 100%; font-size: 9.5pt;">
                    <tr>
                        <td style="width: 60%; padding: 4px 0;"><strong>Candidate Name:</strong> ____________________________________</td>
                        <td style="width: 40%; padding: 4px 0;"><strong>Date:</strong> __________________</td>
                    </tr>
                    <tr>
                        <td style="padding: 4px 0;"><strong>Roll No / Candidate ID:</strong> ________________________</td>
                        <td style="padding: 4px 0;"><strong>Score:</strong> ${score !== null ? `<strong>${score} / ${questions.length}</strong>` : '______ / ' + questions.length}</td>
                    </tr>
                </table>
            </div>

            <div class="paper-section-title">SECTION 1: EXAMINATION QUESTIONS</div>
            <div style="font-size: 9pt; color: #64748b; margin-bottom: 14px; font-style: italic;">
                Answer all questions. Each item carries equal marks. Choose the single best option.
            </div>

            <div class="paper-questions-list">
                ${questions.map((q, i) => `
                    <div class="paper-q-item">
                        <div class="paper-q-prompt">
                            <strong>${i + 1}.</strong> ${q.question}
                            <span class="paper-subtopic-tag">[${q.subtopic || 'General Topic'}]</span>
                        </div>
                        <div class="paper-options-grid">
                            ${(q.type === 'multiple-choice' || !q.type) ? (
                                (q.options || []).map((opt, oi) => `
                                    <div class="paper-option-choice">
                                        <span class="paper-bubble">(&nbsp;&nbsp;)</span>
                                        <span><strong>${OPTION_LETTERS[oi] || oi + 1}.</strong> ${opt}</span>
                                    </div>
                                `).join('')
                            ) : q.type === 'true-false' ? `
                                <div class="paper-option-choice"><span class="paper-bubble">(&nbsp;&nbsp;)</span> <strong>A.</strong> True</div>
                                <div class="paper-option-choice"><span class="paper-bubble">(&nbsp;&nbsp;)</span> <strong>B.</strong> False</div>
                            ` : `
                                <div style="margin: 8px 0; border-bottom: 1px dotted #94a3b8; width: 70%; height: 18px;"></div>
                            `}
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="paper-page-break"></div>

            <div class="paper-section-title" style="margin-top: 24px;">SECTION 2: OFFICIAL MARKING SCHEME & EXPLANATIONS</div>
            <div style="font-size: 9pt; color: #64748b; margin-bottom: 14px; font-style: italic;">
                Official solutions and high-yield examiner rationales.
            </div>

            <div class="paper-answers-list">
                ${questions.map((q, i) => `
                    <div class="paper-ans-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                            <strong>Question ${i + 1}</strong>
                            <span style="color: #059669; font-weight: 800; font-size: 10pt;">Answer: ${getCorrectAnswerText(q)}</span>
                        </div>
                        <div style="font-size: 9pt; color: #334155; margin-top: 3px;">
                            <strong>Why this is correct:</strong> ${q.explanation || 'Verified syllabus fact.'}
                        </div>
                        ${q.examinerTip ? `
                            <div class="paper-tip-box">
                                <strong>💡 Examiner Tip & Trap:</strong> ${q.examinerTip}
                            </div>
                        ` : ''}
                        ${studentAnswers && studentAnswers[i] ? `
                            <div style="font-size: 8.5pt; color: #64748b; margin-top: 3px;">
                                Candidate Selected: ${studentAnswers[i].selected} (${studentAnswers[i].isCorrect ? 'Correct' : 'Incorrect'})
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>

            <div style="margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 8.5pt; color: #94a3b8; text-align: center;">
                EXAMIVO &bull; Official Academic Examination Paper &bull; Printed on ${dateStr}
            </div>
        </div>
    `;

    document.body.appendChild(container);

    // Button Handlers
    document.getElementById('examivo-trigger-print').onclick = () => window.print();
    document.getElementById('examivo-download-pdf-btn').onclick = () => exportQuizAsPdf(quizData, studentAnswers, score);
    document.getElementById('examivo-download-docx-btn').onclick = () => exportQuizAsDocx(quizData, studentAnswers, score);
    document.getElementById('examivo-download-txt-btn').onclick = () => exportQuizAsTxt(quizData, studentAnswers, score);
    document.getElementById('examivo-close-print').onclick = () => container.remove();

    // Automatically trigger print dialog
    setTimeout(() => {
        window.print();
    }, 400);
}
