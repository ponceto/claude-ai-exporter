/*
 * claude-ai-exporter.js - Copyright (c) 2026 - Olivier Poncet
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

(async () => {
    const NOW = new Date();
    const API = '/api';
    const BUNDLE_AS_ZIP = true;
    const CREDENTIALS = 'include';
    const LOG_PREFIX = 'claude-ai-exporter:';
    const MIME_JSON = 'application/json';
    const MIME_ZIP = 'application/zip';
    const HTTP_UNAUTHORIZED = 401;
    const HTTP_FORBIDDEN = 403;
    const HTTP_NOT_FOUND = 404;
    const REVOKE_DELAY = 1000;
    const DOWNLOAD_DELAY = 300;
    const ZIP_MAX_ENTRIES = 0xffff;
    const ZIP_MAX_NAME = 0xffff;
    const ZIP_MAX_SIZE = 0xffffffff;
    const ZIP_LOCAL_HEADER_SIZE = 30;
    const ZIP_CENTRAL_HEADER_SIZE = 46;
    const ZIP_VERSION_MADE_BY = 0x0314;
    const ZIP_FILE_ATTRIBUTES = 0x81a40000;
    const PLACEHOLDER = 'This block is not supported on your current device yet.';
    const OUTPUTS_PREFIX = '/mnt/user-data/outputs/';
    const UPLOADS_PREFIX = '/mnt/user-data/uploads/';
    const OUTPUTS_FOLDER = 'outputs/';
    const UPLOADS_FOLDER = 'uploads/';
    const DEFAULT_CONVERSATION_NAME = 'conversation';
    const DEFAULT_FILE_NAME = 'file';
    const DEFAULT_PASTE_NAME = 'paste.txt';
    const FILE_NAME_MAX_BYTES = 200;
    const EXTENSION_MAX_LENGTH = 16;
    const UNSAFE_CHARACTER_REPLACEMENT = '_';
    const BLOCK_TYPE_TEXT = 'text';
    const SENDER_HUMAN = 'human';
    const SENDER_ASSISTANT = 'assistant';
    const HEADING_TITLE = '# ';
    const HEADING_MESSAGE = '## ';
    const LABEL_HUMAN = 'Human';
    const LABEL_ASSISTANT = 'Assistant';
    const LABEL_UNKNOWN = 'Unknown';

    const logPrint = (...args) => console.log(LOG_PREFIX, ...args);
    const logAlert = (...args) => console.warn(LOG_PREFIX, ...args);
    const logError = (...args) => console.error(LOG_PREFIX, ...args);

    const checkResponse = (response, url) => {
        if(!response.ok) {
            const error = new Error(`HTTP ${response.status} on ${url}`);
            error.status = response.status;
            throw error;
        }
        return response;
    };

    const getJSON = async (url) => {
        const response = await fetch(url, {
            credentials: CREDENTIALS,
            headers: { Accept: MIME_JSON },
        });
        return checkResponse(response, url).json();
    };

    const getBytes = async (url) => {
        const response = await fetch(url, {
            credentials: CREDENTIALS,
        });
        return new Uint8Array(await checkResponse(response, url).arrayBuffer());
    };

    const sleep = (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds));

    const triggerDownload = (name, blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY);
    };

    const zipCrcTable = (() => {
        const table = new Uint32Array(256);
        for(let n = 0; n < 256; n += 1) {
            let value = n;
            for(let bit = 0; bit < 8; bit += 1) {
                value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
            }
            table[n] = value >>> 0;
        }
        return table;
    })();

    const zipCrc32 = (bytes) => {
        let crc = 0xffffffff;
        for(let i = 0; i < bytes.length; i += 1) {
            crc = zipCrcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
    };

    const buildZip = (entries) => {
        const encoder = new TextEncoder();
        const parts = [];
        const centralRecords = [];
        const dosTime = (NOW.getSeconds() >> 1)
                      | (NOW.getMinutes() << 5)
                      | (NOW.getHours()   << 11)
                      ;
        const dosDate = ((NOW.getDate()     +    0) << 0)
                      | ((NOW.getMonth()    +    1) << 5)
                      | ((NOW.getFullYear() - 1980) << 9)
                      ;
        let offset = 0;
        for(const entry of entries) {
            const nameBytes = encoder.encode(entry.name);
            const { bytes } = entry;
            const crc = zipCrc32(bytes);
            const size = bytes.length;

            const local = new Uint8Array(ZIP_LOCAL_HEADER_SIZE + nameBytes.length);
            const localView = new DataView(local.buffer);
            localView.setUint32(0, 0x04034b50, true);
            localView.setUint16(4, 20, true);
            localView.setUint16(6, 0x0800, true);
            localView.setUint16(8, 0, true);
            localView.setUint16(10, dosTime, true);
            localView.setUint16(12, dosDate, true);
            localView.setUint32(14, crc, true);
            localView.setUint32(18, size, true);
            localView.setUint32(22, size, true);
            localView.setUint16(26, nameBytes.length, true);
            localView.setUint16(28, 0, true);
            local.set(nameBytes, ZIP_LOCAL_HEADER_SIZE);
            parts.push(local, bytes);

            const central = new Uint8Array(ZIP_CENTRAL_HEADER_SIZE + nameBytes.length);
            const centralView = new DataView(central.buffer);
            centralView.setUint32(0, 0x02014b50, true);
            centralView.setUint16(4, ZIP_VERSION_MADE_BY, true);
            centralView.setUint16(6, 20, true);
            centralView.setUint16(8, 0x0800, true);
            centralView.setUint16(10, 0, true);
            centralView.setUint16(12, dosTime, true);
            centralView.setUint16(14, dosDate, true);
            centralView.setUint32(16, crc, true);
            centralView.setUint32(20, size, true);
            centralView.setUint32(24, size, true);
            centralView.setUint16(28, nameBytes.length, true);
            centralView.setUint16(30, 0, true);
            centralView.setUint16(32, 0, true);
            centralView.setUint16(34, 0, true);
            centralView.setUint16(36, 0, true);
            centralView.setUint32(38, ZIP_FILE_ATTRIBUTES, true);
            centralView.setUint32(42, offset, true);
            central.set(nameBytes, ZIP_CENTRAL_HEADER_SIZE);
            centralRecords.push(central);

            offset += local.length + size;
        }
        const centralSize = centralRecords.reduce((sum, record) => sum + record.length, 0);
        const end = new Uint8Array(22);
        const endView = new DataView(end.buffer);
        endView.setUint32(0, 0x06054b50, true);
        endView.setUint16(8, entries.length, true);
        endView.setUint16(10, entries.length, true);
        endView.setUint32(12, centralSize, true);
        endView.setUint32(16, offset, true);
        return new Blob([...parts, ...centralRecords, end], { type: MIME_ZIP });
    };

    const match = window.location.pathname.match(/\/chat\/([0-9a-f-]{36})/i);
    if(!match) {
        logError('No conversation detected in the URL. Open a conversation (https://claude.ai/chat/...) then retry.');
        return;
    }
    const conversationUuid = match[1];

    let organizations;
    try {
        organizations = await getJSON(`${API}/organizations`);
    }
    catch(error) {
        logError('Could not fetch organizations. Are you logged in to claude.ai?', error);
        return;
    }
    if(!Array.isArray(organizations) || organizations.length === 0) {
        logError('No organization found on this account.');
        return;
    }

    const conversationPath = (organizationUuid) =>
        `${API}/organizations/${organizationUuid}/chat_conversations/${conversationUuid}` +
        `?tree=True&rendering_mode=messages`;

    let data = null;
    let matchedOrganizationUuid = null;
    let lastError = null;
    let allDenied = true;
    let allMissing = true;
    for(const organization of organizations) {
        const organizationUuid = organization && organization.uuid;
        if(typeof organizationUuid !== 'string' || !/^[\w-]+$/.test(organizationUuid)) continue;
        try {
            const candidate = await getJSON(conversationPath(organizationUuid));
            if(!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.chat_messages)) {
                throw new Error(`Unexpected conversation payload in organization ${organizationUuid}`);
            }
            data = candidate;
            matchedOrganizationUuid = organizationUuid;
            break;
        }
        catch(error) {
            lastError = error;
            const denied = error.status === HTTP_UNAUTHORIZED || error.status === HTTP_FORBIDDEN;
            if(!denied) {
                allDenied = false;
            }
            if(!denied && error.status !== HTTP_NOT_FOUND) {
                allMissing = false;
            }
        }
    }
    if(!data) {
        if(!lastError) {
            logError('No usable organization found on this account.');
        }
        else if(allDenied) {
            logError('Access to the conversation was denied. Your claude.ai session may have expired, log in again then retry.', lastError);
        }
        else if(allMissing) {
            logError('Conversation not found in any of your organizations.', lastError);
        }
        else {
            logError('Unexpected response from claude.ai. Your session may have expired or the internal API may have changed.', lastError);
        }
        return;
    }

    const allMessages = data.chat_messages;

    const activeBranch = (candidates, leafUuid) => {
        if(typeof leafUuid !== 'string') {
            logAlert('Current message unknown, exporting every branch of the conversation in raw order.');
            return candidates;
        }
        const byUuid = new Map();
        for(const message of candidates) {
            if(message && typeof message.uuid === 'string') {
                byUuid.set(message.uuid, message);
            }
        }
        const branch = [];
        const visited = new Set();
        let currentUuid = leafUuid;
        while(typeof currentUuid === 'string' && byUuid.has(currentUuid) && !visited.has(currentUuid)) {
            visited.add(currentUuid);
            const message = byUuid.get(currentUuid);
            branch.push(message);
            currentUuid = message.parent_message_uuid;
        }
        if(visited.has(currentUuid)) {
            logAlert('Cycle detected in the message tree, the exported thread may be incomplete.');
        }
        if(branch.length === 0) {
            logAlert('Current message not found, exporting every branch of the conversation in raw order.');
            return candidates;
        }
        branch.reverse();
        return branch;
    };

    const messages = activeBranch(allMessages, data.current_leaf_message_uuid);

    const stripPlaceholder = (text) => {
        const output = [];
        let fence = null;
        for(const line of text.split('\n')) {
            const trimmed = line.trim();
            if(fence === null) {
                const opening = trimmed.match(/^(`{3,})(?!.*`)|^(~{3,})/);
                if(opening) {
                    fence = { start: output.length, marker: opening[1] || opening[2], placeholder: false, content: false };
                    output.push(line);
                }
                else if(trimmed === PLACEHOLDER) {
                    continue;
                }
                else if(trimmed !== '' || output.length === 0 || output[output.length - 1].trim() !== '') {
                    output.push(line);
                }
                continue;
            }
            if(trimmed.length >= fence.marker.length && trimmed === fence.marker[0].repeat(trimmed.length)) {
                if(fence.placeholder && !fence.content) {
                    output.length = fence.start;
                    if(output.length > 0 && output[output.length - 1].trim() !== '') {
                        output.push('');
                    }
                }
                else {
                    output.push(line);
                }
                fence = null;
                continue;
            }
            if(trimmed === PLACEHOLDER) {
                fence.placeholder = true;
                continue;
            }
            if(trimmed !== '') {
                fence.content = true;
            }
            output.push(line);
        }
        return output.join('\n').trim();
    };

    const extractText = (message) => {
        if(!message || typeof message !== 'object') return '';
        if(Array.isArray(message.content)) {
            const parts = message.content
                .filter((block) => block && block.type === BLOCK_TYPE_TEXT && typeof block.text === 'string')
                .map((block) => stripPlaceholder(block.text))
                .filter(Boolean);
            if(parts.length) return parts.join('\n\n');
        }
        return typeof message.text === 'string' ? stripPlaceholder(message.text) : '';
    };

    const labelFor = (sender) => {
        switch(sender) {
            case SENDER_HUMAN:
                return `${HEADING_MESSAGE}${LABEL_HUMAN}`;
            case SENDER_ASSISTANT:
                return `${HEADING_MESSAGE}${LABEL_ASSISTANT}`;
            default:
                return `${HEADING_MESSAGE}${(typeof sender === 'string' && sender.replace(/\s+/g, ' ').trim()) || LABEL_UNKNOWN}`;
        }
    };

    const title = (typeof data.name === 'string' && data.name.replace(/\s+/g, ' ').trim()) || DEFAULT_CONVERSATION_NAME;
    const blocks = [`${HEADING_TITLE}${title}`];
    let exported = 0;
    for(const message of messages) {
        const text = extractText(message);
        if(!text) continue;
        blocks.push(labelFor(message.sender));
        blocks.push(text);
        exported += 1;
    }

    const conversationName =
        Array.from(title.replace(/[^\p{L}\p{N}]+/gu, '-'))
            .slice(0, 80)
            .join('')
            .replace(/^-+|-+$/g, '') || DEFAULT_CONVERSATION_NAME;

    const limitBytes = (text, maxBytes) => {
        const encoder = new TextEncoder();
        let result = '';
        let size = 0;
        for(const character of text) {
            size += encoder.encode(character).length;
            if(size > maxBytes) break;
            result += character;
        }
        return result;
    };

    const safeFileName = (path, fallback) => {
        const cleaned = path
            .split('/')
            .pop()
            .normalize('NFC')
            .replace(/[\p{Cc}\p{Cf}\p{Cs}\\:*?"<>|\u2215\u2044\uff0f]/gu, UNSAFE_CHARACTER_REPLACEMENT);
        const dot = cleaned.lastIndexOf('.');
        const extension = dot > 0 && cleaned.length - dot <= EXTENSION_MAX_LENGTH ? cleaned.slice(dot) : '';
        const base = extension ? cleaned.slice(0, dot) : cleaned;
        const name = (limitBytes(base, FILE_NAME_MAX_BYTES - new TextEncoder().encode(extension).length) + extension)
            .trim()
            .replace(/[.\s]+$/u, '');
        return /^\.*$/.test(name) ? fallback : name;
    };

    const foldName = (name) => name.toUpperCase().toLowerCase();

    const makeUniqueName = () => {
        const usedNames = new Set();
        const nextIndex = new Map();
        return (name) => {
            if(!usedNames.has(foldName(name))) {
                usedNames.add(foldName(name));
                return name;
            }
            const slash = name.lastIndexOf('/');
            const dot = name.lastIndexOf('.');
            const base = dot > slash + 1 ? name.slice(0, dot) : name;
            const extension = dot > slash + 1 ? name.slice(dot) : '';
            const key = foldName(name);
            let index = nextIndex.get(key) || 1;
            let candidate;
            do {
                candidate = `${base}-${index}${extension}`;
                index += 1;
            } while(usedNames.has(foldName(candidate)));
            nextIndex.set(key, index);
            usedNames.add(foldName(candidate));
            return candidate;
        };
    };

    const entries = [];
    const uniqueZipPath = makeUniqueName();
    if(exported > 0) {
        const markdown = blocks.join('\n\n') + '\n';
        const markdownName = `${conversationName}.md`;
        entries.push({
            path: uniqueZipPath(markdownName),
            name: markdownName,
            bytes: new TextEncoder().encode(markdown),
        });
    }
    else {
        logAlert('No conversation text to export.');
    }

    const uploadedNames = new Set();
    const wiggle = `${API}/organizations/${matchedOrganizationUuid}/conversations/${conversationUuid}/wiggle`;
    try {
        const listing = await getJSON(`${wiggle}/list-files`);
        const files = listing && Array.isArray(listing.files) ? listing.files : [];
        const exportable = [...new Set(files)].filter(
            (filePath) =>
                typeof filePath === 'string' &&
                (filePath.startsWith(OUTPUTS_PREFIX) || filePath.startsWith(UPLOADS_PREFIX)) &&
                !filePath.endsWith('/') &&
                !filePath.split('/').some((segment) => segment === '.' || segment === '..'),
        );
        for(const filePath of exportable) {
            const folder = filePath.startsWith(OUTPUTS_PREFIX) ? OUTPUTS_FOLDER : UPLOADS_FOLDER;
            const fileName = safeFileName(filePath, DEFAULT_FILE_NAME);
            try {
                entries.push({
                    path: uniqueZipPath(`${folder}${fileName}`),
                    name: fileName,
                    bytes: await getBytes(`${wiggle}/download-file?path=${encodeURIComponent(filePath)}`),
                });
                if(folder === UPLOADS_FOLDER) {
                    uploadedNames.add(foldName(fileName));
                }
            }
            catch(error) {
                logAlert(`Error while downloading ${filePath}.`, error);
            }
        }
    }
    catch(error) {
        logAlert('Files list unavailable (wiggle).', error);
    }

    for(const message of messages) {
        if(!message || !Array.isArray(message.attachments)) continue;
        for(const attachment of message.attachments) {
            if(!attachment || typeof attachment.extracted_content !== 'string' || !attachment.extracted_content) continue;
            const namedAttachment = typeof attachment.file_name === 'string' && attachment.file_name.trim() !== '';
            const attachmentName = namedAttachment ? safeFileName(attachment.file_name, DEFAULT_PASTE_NAME) : DEFAULT_PASTE_NAME;
            if(namedAttachment && uploadedNames.has(foldName(attachmentName))) continue;
            entries.push({
                path: uniqueZipPath(`${UPLOADS_FOLDER}${attachmentName}`),
                name: attachmentName,
                bytes: new TextEncoder().encode(attachment.extracted_content),
            });
        }
    }

    if(entries.length === 0) {
        logError('Nothing to export.');
        return;
    }

    const pathLengths = entries.map((entry) => new TextEncoder().encode(entry.path).length);
    const fitsInZip =
        entries.length <= ZIP_MAX_ENTRIES &&
        pathLengths.every((length) => length <= ZIP_MAX_NAME) &&
        entries.every((entry) => entry.bytes.length <= ZIP_MAX_SIZE) &&
        entries.reduce((sum, entry, index) => sum + ZIP_LOCAL_HEADER_SIZE + pathLengths[index] + entry.bytes.length, 0) < ZIP_MAX_SIZE &&
        pathLengths.reduce((sum, length) => sum + ZIP_CENTRAL_HEADER_SIZE + length, 0) < ZIP_MAX_SIZE;
    if(BUNDLE_AS_ZIP && !fitsInZip) {
        logAlert('Content exceeds ZIP32 limits, downloading files individually.');
    }

    let destination;
    let fileList;
    if(BUNDLE_AS_ZIP && fitsInZip) {
        const zipEntries = entries.map((entry) => ({ name: entry.path, bytes: entry.bytes }));
        triggerDownload(`${conversationName}.zip`, buildZip(zipEntries));
        destination = `"${conversationName}.zip"`;
        fileList = zipEntries.map((entry) => entry.name).join(', ');
    }
    else {
        const uniqueFileName = makeUniqueName();
        const downloadedNames = [];
        for(const entry of entries) {
            const fileName = uniqueFileName(entry.name);
            triggerDownload(fileName, new Blob([entry.bytes]));
            downloadedNames.push(fileName);
            await sleep(DOWNLOAD_DELAY);
        }
        destination = 'individual files';
        fileList = downloadedNames.join(', ');
    }
    logPrint(`${exported} message(s), ${entries.length} file(s) -> ${destination} : ${fileList}`);
})();
