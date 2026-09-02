// ==========================================
// content/export.js — Export buttons and export engine
// Depends on: utils.js, data.js (extractProjectDetailsFull, extractMyProposalFull)
// ==========================================

function injectMessageExporter() {
    const targetPanel = document.querySelector("#message-meta");
    if (!targetPanel) return;

    if (document.getElementById('mostaql-export-chat-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'mostaql-export-chat-btn';
    btn.className = 'btn btn-primary btn-block';
    btn.style.marginTop = '15px';
    btn.style.marginBottom = '15px';
    btn.innerHTML = '<i class="fa fa-download"></i> تصدير';
    btn.title = '';

    let clickCount = 0;
    let clickTimer = null;

    btn.addEventListener('click', async () => {
        clickCount++;
        clearTimeout(clickTimer);

        if (clickCount >= 2) {
            clickCount = 0;
            const originalHtml = btn.innerHTML;
            const originalStyle = { opacity: btn.style.opacity, bg: btn.style.backgroundColor };

            btn.disabled = true;
            btn.style.opacity = '1';
            btn.style.backgroundColor = '#2386c8';
            btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';

            try {
                await executeExportAll();
            } finally {
                btn.disabled = false;
                btn.style.opacity = originalStyle.opacity;
                btn.style.backgroundColor = originalStyle.bg;
                btn.innerHTML = originalHtml;
            }
        } else {
            clickTimer = setTimeout(() => { clickCount = 0; }, 600);
        }
    });

    targetPanel.after(btn);
}

function injectProjectExporter() {
    const buttonContainer = document.getElementById('mostaql-ext-btn-container');
    if (!buttonContainer) return;

    if (document.getElementById('mostaql-export-project-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'mostaql-export-project-btn';
    btn.className = 'btn btn-primary';
    btn.style.marginRight = '8px';
    btn.innerHTML = '<i class="fa fa-download"></i> <span class="action-text">تصدير</span>';
    btn.title = '';

    let clickCount = 0;
    let clickTimer = null;

    btn.addEventListener('click', async () => {
        clickCount++;
        clearTimeout(clickTimer);

        if (clickCount >= 2) {
            clickCount = 0;
            const originalHtml = btn.innerHTML;
            const originalStyle = { opacity: btn.style.opacity, bg: btn.style.backgroundColor };

            btn.disabled = true;
            btn.style.opacity = '1';
            btn.style.backgroundColor = '#2386c8';
            btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';

            try {
                await executeExportAll();
            } finally {
                btn.disabled = false;
                btn.style.opacity = originalStyle.opacity;
                btn.style.backgroundColor = originalStyle.bg;
                btn.innerHTML = originalHtml;
            }
        } else {
            clickTimer = setTimeout(() => { clickCount = 0; }, 600);
        }
    });

    buttonContainer.appendChild(btn);
}

async function executeExportAll() {
    console.log("Starting export...");

    const myName = document.querySelector('.user-menu__name')?.innerText.trim() ||
                   document.querySelector('#user-menu bdi')?.innerText.trim() ||
                   "غير معروف";

    const messages = document.querySelectorAll("#chat-root [id^='message-'], .message-item");

    let chatData = [];
    let textOutput = "تصدير محادثة مستقل (بالتاريخ)\n\n";
    let textOutputNoTime = "تصدير محادثة مستقل (بدون تاريخ)\n\n";
    let mediaUrls = [];

    if (messages.length > 0) {
        const firstMsgNameEl = messages[0].querySelector('.metas-title');
        const firstSenderName = firstMsgNameEl ? firstMsgNameEl.innerText.trim() : "Other";

        let lastKnownSender = { name: firstSenderName, isUs: false, avatar: "" };

        messages.forEach((msg) => {
            const nameEl = msg.querySelector('.metas-title');
            const timeEl = msg.querySelector('time');
            const avatarEl = msg.querySelector('img.uavatar') || msg.querySelector('img:not([class="meta-icon"])');

            let currentName = nameEl ? nameEl.innerText.trim() : null;
            let currentTime = timeEl ? (timeEl.getAttribute('title') || timeEl.innerText.trim()) : null;
            let currentAvatar = avatarEl ? avatarEl.src : null;

            let isUs, senderName, displayAvatar;

            if (currentName) {
                isUs = (currentName !== firstSenderName);
                senderName = currentName;
                displayAvatar = currentAvatar;
                lastKnownSender = { name: senderName, isUs: isUs, avatar: displayAvatar };
            } else {
                isUs = lastKnownSender.isUs;
                senderName = lastKnownSender.name;
                displayAvatar = lastKnownSender.avatar;
            }

            // Better extraction for chat messages: pick the container and ensure all text/lines are captured
            const containerEl = msg.querySelector('.content, .text-wrapper-div');
            let text = "";
            if (containerEl) {
                // To avoid getting extra text like avatars or times, we look for the direct text parts
                // In Mostaql chat, messages are often multiple P tags or text with BR
                text = containerEl.innerText.trim();
            } else {
                // Fallback: collect all P tags inside the message
                const pTags = msg.querySelectorAll('p');
                if (pTags.length > 0) {
                    text = Array.from(pTags).map(p => p.innerText.trim()).join('\n');
                } else {
                    // Final fallback
                    text = msg.innerText.trim();
                }
            }

            let attachments = [];

            const getFilenameFromUrl = (urlStr) => {
                try {
                    const u = new URL(urlStr);
                    const parts = u.pathname.split('/');
                    return parts.pop() || 'media_file';
                } catch {
                    return 'media_file';
                }
            };

            const processLink = (linkNode) => {
                const url = linkNode.href;
                let filename = linkNode.innerText.trim();
                if (!filename || filename === "") filename = getFilenameFromUrl(url);
                if (!attachments.find(a => a.url === url)) attachments.push({ url, name: filename });
                if (!mediaUrls.find(m => m.url === url)) mediaUrls.push({ url, name: filename });
            };

            msg.querySelectorAll('a[href*="/file/"]').forEach(processLink);
            msg.querySelectorAll('.single-image-container a[href]').forEach(processLink);

            msg.querySelectorAll('audio').forEach(audio => {
                const url = audio.src;
                if (url) {
                    const filename = getFilenameFromUrl(url);
                    if (!attachments.find(a => a.url === url)) attachments.push({ url, name: filename });
                    if (!mediaUrls.find(m => m.url === url)) mediaUrls.push({ url, name: filename });
                }
            });

            msg.querySelectorAll('video').forEach(video => {
                let bestUrl = video.src;
                if (!bestUrl) {
                    const sources = Array.from(video.querySelectorAll('source'));
                    const mp4Source = sources.find(s => (s.type && s.type.includes('mp4')) || (s.src && s.src.includes('.mp4')));
                    const anySource = mp4Source || sources[0];
                    if (anySource && anySource.src) bestUrl = anySource.src;
                }
                if (bestUrl) {
                    const filename = getFilenameFromUrl(bestUrl);
                    if (!attachments.find(a => a.url === bestUrl)) attachments.push({ url: bestUrl, name: filename });
                    if (!mediaUrls.find(m => m.url === bestUrl)) mediaUrls.push({ url: bestUrl, name: filename });
                }
            });

            if (text || attachments.length > 0) {
                chatData.push({ senderName, isUs, text, time: currentTime || "", avatar: displayAvatar, attachments });
                const attachmentsSection = attachments.length > 0 ? `\n[مرفقات: ${attachments.map(a => a.name).join(', ')}]` : '';
                textOutput += `[${currentTime || ''}] ${senderName}:\n${text.trim()}${attachmentsSection}\n\n`;
                textOutputNoTime += `${senderName}:\n${text.trim()}${attachmentsSection}\n\n`;
            }
        });
    }

    console.log("Extracted Chat Data:", chatData);

    const projectDetailsResult = await extractProjectDetailsFull();
    const myProposalResult = extractMyProposalFull(projectDetailsResult?.data);

    const projectDetailsText = projectDetailsResult?.text || "";
    const myProposalText = myProposalResult?.text || "";
    const pData = projectDetailsResult?.data || {};
    const propData = myProposalResult?.data || {};

    const projectIdMatch = window.location.pathname.match(/\/(message|project)\/(\d+)/);
    const discussionId = projectIdMatch ? projectIdMatch[2] : Date.now();

    let safeTitle = document.title ? document.title.replace(/[^\u0600-\u06FFa-zA-Z0-9 ]/gi, '_') : 'export';
    safeTitle = safeTitle.replace(/_+/g, '_').replace(/^_+|_+$/g, '').substring(0, 50);

    const folderName = `mostaql_export_${discussionId}_${safeTitle}`;

    const html = `
    <html dir="rtl" lang="ar">
    <head>
        <meta charset="UTF-8">
        <title>تقرير مشروع مستقل - ${discussionId}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
        <style>
            :root {
                --primary: #2386c8;
                --primary-light: #e3f2fd;
                --text-main: #2c3e50;
                --text-muted: #7f8c8d;
                --bg-body: #f8fafc;
                --bg-card: #ffffff;
                --border-color: #e2e8f0;
                --radius: 12px;
                --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            }
            * { box-sizing: border-box; }
            body { font-family: 'Cairo', sans-serif; background: var(--bg-body); padding: 40px 20px; line-height: 1.6; color: var(--text-main); margin: 0; font-size: 14px; }
            .container { max-width: 950px; margin: auto; background: var(--bg-card); padding: 40px; border-radius: var(--radius); box-shadow: var(--shadow); }
            header { text-align: center; margin-bottom: 50px; padding-bottom: 25px; border-bottom: 2px solid var(--primary-light); }
            h1 { margin: 0; color: var(--primary); font-size: 28px; font-weight: 700; }
            .date-stamp { color: var(--text-muted); font-size: 14px; margin-top: 8px; font-weight: 400; }
            section { margin-bottom: 20px; }
            h2 { color: var(--text-main); font-size: 19px; font-weight: 700; display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
            h2::before { content: ''; display: none; }
            h3 { font-size: 15px; color: var(--primary); margin: 15px 0 8px; font-weight: 600; }
            .info-card { background: #fbfcfd; border: 1px solid var(--border-color); border-radius: var(--radius); padding: 12px 16px; margin-bottom: 12px; }
            .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 12px; }
            .info-grid.col-3 { grid-template-columns: repeat(3, 1fr); }
            .info-item { display: flex; flex-direction: column; padding: 3px 5px; border-bottom: 1px solid #f8fafc; }
            .info-item.full-width { grid-column: 1 / -1; }
            .info-label { font-size: 11px; color: var(--text-muted); font-weight: 600; margin-bottom: 1px; }
            .info-value { font-size: 13.5px; color: var(--text-main); font-weight: 700; }
            .content-box { background: #fff; border: 1px solid var(--border-color); padding: 15px; border-radius: var(--radius); white-space: pre-wrap; font-size: 13.5px; line-height: 1.5; color: #334155; }
            .tags-cloud { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 15px; }
            .tag-pill { background: var(--primary-light); color: var(--primary); padding: 5px 14px; border-radius: 50px; font-size: 13px; font-weight: 600; border: 1px solid #bbdefb; transition: all 0.2s; }
            .chat-container { display: flex; flex-direction: column; gap: 20px; margin-top: 30px; }
            .msg-row { display: flex; width: 100%; align-items: flex-start; }
            .msg-row.us { flex-direction: row-reverse; }
            .avatar-col { width: 60px; flex-shrink: 0; padding: 0 10px; text-align: center; }
            .avatar-col img { width: 45px; height: 45px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
            .bubble { max-width: 80%; padding: 12px 18px; border-radius: 18px; box-shadow: 0 2px 10px rgba(0,0,0,0.02); font-size: 13px; word-break: break-word; overflow-wrap: break-word; }
            .text-content { white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word; min-height: 1.2em; }
            .msg-row { page-break-inside: avoid; margin-bottom: 15px; }
            .us .bubble { background: #e3f2fd; color: #1e293b; border-top-right-radius: 4px; }
            .other .bubble { background: #fff; border: 1px solid var(--border-color); border-top-left-radius: 4px; }
            .sender-name { font-weight: 700; font-size: 12.5px; display: block; margin-bottom: 8px; color: var(--primary); }
            .time { font-size: 11px; color: var(--text-muted); display: block; margin-top: 10px; }
            .attachment-preview { margin-top: 20px; }
            .attachment-preview img { max-width: 100%; max-height: 500px; border-radius: var(--radius); border: 1px solid var(--border-color); object-fit: contain; box-shadow: var(--shadow); }
            .attach-link { display: inline-flex; align-items: center; gap: 8px; color: var(--primary); text-decoration: none; font-size: 12.5px; margin-top: 12px; font-weight: 600; padding: 8px 15px; background: var(--primary-light); border-radius: 8px; }
            .container { counter-reset: section; }
            section h2::before { counter-increment: section; content: counter(section) ". "; }
            .page-break { page-break-before: always; }
            @media print {
                body { background: #fff !important; padding: 0 !important; }
                .container { box-shadow: none !important; border: none !important; width: 100% !important; max-width: none !important; padding: 0 !important; }
                .no-print { display: none !important; }
                .info-card, .content-box, .bubble { border: 1px solid #e2e8f0 !important; page-break-inside: auto !important; }
                h1, h2, h3 { color: #000 !important; page-break-after: avoid !important; }
                .msg-row { page-break-inside: avoid !important; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <h1>تقرير عمل مشروع مستقل</h1>
                <div class="date-stamp">${new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </header>

            <section>
                <h2>وصف وتفاصيل المشروع</h2>
                <div class="info-card">
                    <div class="info-grid">
                        <div class="info-item full-width"><span class="info-label">اسم المشروع</span><span class="info-value">${pData.title || "-"}</span></div>
                        <div class="info-item"><span class="info-label">حالة المشروع</span><span class="info-value">${pData.status || "-"}</span></div>
                        <div class="info-item"><span class="info-label">الميزانية</span><span class="info-value">${pData.budget || "-"}</span></div>
                        <div class="info-item"><span class="info-label">مدة التنفيذ</span><span class="info-value">${pData.duration || "-"}</span></div>
                        <div class="info-item"><span class="info-label">صاحب العمل</span><span class="info-value">${pData.clientName || "-"}</span></div>
                        ${(pData.category && pData.category !== 'غير معروف' && pData.category !== 'Unknown') ? `<div class="info-item"><span class="info-label">القسم</span><span class="info-value">${pData.category}</span></div>` : ''}
                    </div>
                </div>
                <h3>نص الوصف:</h3>
                <div class="content-box">${pData.description || "لا يوجد وصف"}</div>
                <div class="tags-cloud">
                    ${(pData.tagsList || []).map(t => `<span class="tag-pill">${t}</span>`).join('')}
                </div>
            </section>

            <section>
                <h2>معلومات صاحب العمل</h2>
                <div class="info-card">
                    <div class="info-grid col-3">
                        <div class="info-item"><span class="info-label">اسم صاحب المشروع</span><span class="info-value">${pData.clientName || "-"}</span></div>
                        <div class="info-item"><span class="info-label">تاريخ التسجيل</span><span class="info-value">${pData.clientJoined || "-"}</span></div>
                        <div class="info-item"><span class="info-label">معدل التوظيف</span><span class="info-value">${pData.hiringRate || "-"}</span></div>
                        ${pData.clientTitle ? `<div class="info-item"><span class="info-label">المسمى الوظيفي</span><span class="info-value">${pData.clientTitle}</span></div>` : ''}
                        <div class="info-item"><span class="info-label">المشاريع المفتوحة</span><span class="info-value">${pData.openProjects || "0"}</span></div>
                        <div class="info-item"><span class="info-label">مشاريع قيد التنفيذ</span><span class="info-value">${pData.underwayProjects || "0"}</span></div>
                        <div class="info-item"><span class="info-label">التواصلات الجارية</span><span class="info-value">${pData.ongoingCommunications || "0"}</span></div>
                    </div>
                </div>
            </section>

            ${(propData && ((propData.price && propData.price !== '-') || (propData.duration && propData.duration !== '-'))) ? `
            <section>
                <h2>العرض والاتفاق المالي</h2>
                <div class="info-card">
                    <div class="info-grid col-3">
                        <div class="info-item"><span class="info-label">المقدم</span><span class="info-value">${propData.freelancer || "-"}</span></div>
                        <div class="info-item"><span class="info-label">المبلغ المتفق عليه</span><span class="info-value">${propData.price || "-"}</span></div>
                        <div class="info-item"><span class="info-label">المدة الزمنية</span><span class="info-value">${propData.duration || "-"}</span></div>
                    </div>
                </div>
                <h3>نص العرض المقدم:</h3>
                <div class="content-box">${propData.content || "لا يوجد نص"}</div>
            </section>
            ` : ''}

            ${(chatData && chatData.length > 0) ? `
            <div class="page-break"></div>
            <section>
                <h2>سجل المناقشات والرسائل</h2>
                <div class="chat-container">
                    ${chatData.map(m => `
                        <div class="msg-row ${m.isUs ? 'us' : 'other'}">
                            <div class="avatar-col">
                                ${m.avatar ? `<img src="${m.avatar}">` : '<i class="fa fa-user-circle fa-3x" style="color:#cbd5e1;"></i>'}
                            </div>
                            <div class="bubble">
                                <span class="sender-name">${m.senderName}</span>
                                <div class="text-content">${m.text.replace(/\n/g, '<br>')}</div>
                                ${m.attachments.map(a => {
                                    const isImg = a.name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                                    const isAudio = a.name.match(/\.(mp3|wav|ogg|m4a|aac)$/i);
                                    const isVideo = a.name.match(/\.(mp4|webm|ogg)$/i);
                                    return `
                                        <div class="attachment-preview">
                                            ${isImg ? `<img src="${a.url}" alt="${a.name}" onerror="this.style.display='none'">` : ''}
                                            ${isAudio ? `<audio controls src="${a.url}" style="width: 100%; margin-top: 10px; border-radius: 8px; background: #f1f5f9;"></audio>` : ''}
                                            ${isVideo ? `<video controls src="${a.url}" style="width: 100%; margin-top: 10px; border-radius: 8px; background: #000; max-height: 400px;"></video>` : ''}
                                            <a href="${a.url}" target="_blank" class="attach-link"><i class="fa fa-paperclip"></i> ${a.name}</a>
                                        </div>`;
                                }).join('')}
                                <span class="time">${m.time}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </section>
            ` : ''}

            <button class="no-print" onclick="window.print()" style="position:fixed; bottom:40px; left:40px; padding: 20px 40px; background: var(--primary); color:#fff; border:none; border-radius: 50px; cursor:pointer; font-family: 'Cairo', sans-serif; font-weight:700; font-size:18px; box-shadow: 0 10px 25px rgba(35, 134, 200, 0.4); display: flex; align-items: center; gap: 12px; transition: all 0.2s;">
                <i class="fa fa-file-pdf-o"></i> حفظ وحفظ كـ PDF
            </button>
        </div>
    </body>
    </html>`;

    const filesToZip = [];

    const hasAttachments = (pData.attachments && pData.attachments.length > 0) ||
                           (mediaUrls && mediaUrls.length > 0) ||
                           (propData.attachments && propData.attachments.length > 0);

    if (hasAttachments) {
        let attachmentsListTxt = "قائمة بجميع المرفقات والروابط المكتشفة\n";
        attachmentsListTxt += "==========================================\n\n";
        if (pData.attachments && pData.attachments.length > 0) {
            attachmentsListTxt += "--- ملفات ومرفقات المشروع ---\n";
            pData.attachments.forEach(a => attachmentsListTxt += `${a.name}: ${a.url}\n`);
            attachmentsListTxt += "\n";
        }
        if (mediaUrls && mediaUrls.length > 0) {
            attachmentsListTxt += "--- ملفات ومرفقات المحادثة ---\n";
            mediaUrls.forEach(a => attachmentsListTxt += `${a.name}: ${a.url}\n`);
            attachmentsListTxt += "\n";
        }
        if (propData.attachments && propData.attachments.length > 0) {
            attachmentsListTxt += "--- ملفات ومرفقات عرضي ---\n";
            propData.attachments.forEach(a => attachmentsListTxt += `${a.name}: ${a.url}\n`);
            attachmentsListTxt += "\n";
        }
        filesToZip.push({ name: `all_attachments_links.txt`, content: attachmentsListTxt });
    }

    if (chatData && chatData.length > 0) {
        filesToZip.push({ name: `chat_log.txt`, content: textOutput });
        filesToZip.push({ name: `chat_log_simple.txt`, content: textOutputNoTime });
    }

    filesToZip.push({ name: `report.html`, content: html });

    if (pData.bids && pData.bids.length > 0) {
        let bidsTxt = `عروض المستقلين الآخرين لجلسة: ${discussionId}\n`;
        bidsTxt += `عدد العروض: ${pData.bids.length}\n==========================================\n\n`;
        pData.bids.forEach((bid, i) => {
            bidsTxt += `${i + 1}. ${bid.name} (${bid.title})\n`;
            bidsTxt += `الرابط: ${bid.link}\n`;
            bidsTxt += `التوقيت: ${bid.timeText} (${bid.timeOffset || "غير محدد"})\n`;
            bidsTxt += `نص العرض:\n${bid.content}\n------------------------------------------\n\n`;
        });
        filesToZip.push({ name: `other_bids_details.txt`, content: bidsTxt });
    }

    if (projectDetailsText) filesToZip.push({ name: `project_details.txt`, content: projectDetailsText });
    if (myProposalText) filesToZip.push({ name: `my_proposal.txt`, content: myProposalText });

    const sanitizeFile = (name, fallback) => {
        if (!name) return fallback;
        return name.replace(/[^\u0600-\u06FFa-zA-Z0-9.\-_ ]/g, '_').trim();
    };

    mediaUrls.forEach((media, index) => {
        filesToZip.push({ name: `chat_attachments/${sanitizeFile(media.name, `chat_file_${index}`)}`, url: media.url });
    });

    if (pData.attachments && pData.attachments.length > 0) {
        pData.attachments.forEach((file, index) => {
            filesToZip.push({ name: `client_attachments/${sanitizeFile(file.name, `client_file_${index}`)}`, url: file.url });
        });
    }

    if (propData.attachments && propData.attachments.length > 0) {
        propData.attachments.forEach((file, index) => {
            filesToZip.push({ name: `bid_attachments/${sanitizeFile(file.name, `bid_file_${index}`)}`, url: file.url });
        });
    }

    if (chrome.runtime && chrome.runtime.id) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: 'download_zip',
                filename: `${folderName}.zip`,
                files: filesToZip
            }, () => {
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                resolve();
            });
        });
    } else {
        alert("انتهت صلاحية جلسة الإضافة بسبب تحديثها. يرجى تحديث الصفحة (Refresh) والمحاولة مرة أخرى.");
        throw new Error("Context invalidated");
    }
}
