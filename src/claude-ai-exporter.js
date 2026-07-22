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
    const REVOKE_DELAY = 1000;
    const ZIP_MAX_ENTRIES = 0xffff;
    const ZIP_MAX_SIZE = 0xffffffff;
    const PLACEHOLDER = 'This block is not supported on your current device yet.';
    const OUTPUTS_PREFIX = '/mnt/user-data/outputs/';
    const DEFAULT_CONVERSATION_NAME = 'conversation';
    const DEFAULT_FILE_NAME = 'file';
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

            const local = new Uint8Array(30 + nameBytes.length);
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
            local.set(nameBytes, 30);
            parts.push(local, bytes);

            const central = new Uint8Array(46 + nameBytes.length);
            const centralView = new DataView(central.buffer);
            centralView.setUint32(0, 0x02014b50, true);
            centralView.setUint16(4, 20, true);
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
            centralView.setUint32(38, 0, true);
            centralView.setUint32(42, offset, true);
            central.set(nameBytes, 46);
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
    for(const organization of organizations) {
        const organizationUuid = organization && organization.uuid;
        if(typeof organizationUuid !== 'string') continue;
        try {
            data = await getJSON(conversationPath(organizationUuid));
            matchedOrganizationUuid = organizationUuid;
            break;
        }
        catch(error) {
            lastError = error;
        }
    }
    if(!data) {
        const status = lastError && lastError.status;
        if(status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) {
            logError('Access to the conversation was denied. Your claude.ai session may have expired, log in again then retry.', lastError);
        }
        else {
            logError('Conversation not found in any of your organizations.', lastError);
        }
        return;
    }

    const allMessages = Array.isArray(data.chat_messages) ? data.chat_messages : [];

    const activeBranch = (candidates, leafUuid) => {
        if(typeof leafUuid !== 'string') return candidates;
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
        if(branch.length === 0) return candidates;
        branch.reverse();
        return branch;
    };

    const messages = activeBranch(allMessages, data.current_leaf_message_uuid);

    const stripPlaceholder = (text) => {
        let cleaned = text
            .split('\n')
            .filter((line) => line.trim() !== PLACEHOLDER)
            .join('\n');
        cleaned = cleaned.replace(/```[^\n]*\n\s*```/g, '');
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        return cleaned.trim();
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
                return `${HEADING_MESSAGE}${sender || LABEL_UNKNOWN}`;
        }
    };

    const title = (typeof data.name === 'string' && data.name.trim()) || DEFAULT_CONVERSATION_NAME;
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
        title
            .replace(/[^\p{L}\p{N}]+/gu, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80) || DEFAULT_CONVERSATION_NAME;

    const usedNames = new Set();
    const uniqueName = (name) => {
        if(!usedNames.has(name)) {
            usedNames.add(name);
            return name;
        }
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name;
        const extension = dot > 0 ? name.slice(dot) : '';
        let index = 1;
        let candidate;
        do {
            candidate = `${base}-${index}${extension}`;
            index += 1;
        } while(usedNames.has(candidate));
        usedNames.add(candidate);
        return candidate;
    };

    const entries = [];
    if(exported > 0) {
        const markdown = blocks.join('\n\n') + '\n';
        entries.push({
            name: uniqueName(`${conversationName}.md`),
            bytes: new TextEncoder().encode(markdown),
        });
    }
    else {
        logAlert('No conversation text to export.');
    }

    const wiggle = `${API}/organizations/${matchedOrganizationUuid}/conversations/${conversationUuid}/wiggle`;
    try {
        const listing = await getJSON(`${wiggle}/list-files`);
        const files = listing && Array.isArray(listing.files) ? listing.files : [];
        const generated = files.filter(
            (filePath) =>
                typeof filePath === 'string' &&
                filePath.startsWith(OUTPUTS_PREFIX),
        );
        for(const filePath of generated) {
            try {
                entries.push({
                    name: uniqueName(filePath.split('/').pop() || DEFAULT_FILE_NAME),
                    bytes: await getBytes(`${wiggle}/download-file?path=${encodeURIComponent(filePath)}`),
                });
            }
            catch(error) {
                logAlert(`Error while downloading ${filePath}.`, error);
            }
        }
    }
    catch(error) {
        logAlert('Generated files list unavailable (wiggle).', error);
    }

    if(entries.length === 0) {
        logError('Nothing to export.');
        return;
    }

    const fitsInZip =
        entries.length <= ZIP_MAX_ENTRIES &&
        entries.every((entry) => entry.bytes.length <= ZIP_MAX_SIZE) &&
        entries.reduce((sum, entry) => sum + entry.bytes.length, 0) <= ZIP_MAX_SIZE;
    if(BUNDLE_AS_ZIP && !fitsInZip) {
        logAlert('Content exceeds ZIP32 limits, downloading files individually.');
    }

    const fileList = entries.map((entry) => entry.name).join(', ');
    let destination;
    if(BUNDLE_AS_ZIP && fitsInZip) {
        triggerDownload(`${conversationName}.zip`, buildZip(entries));
        destination = `"${conversationName}.zip"`;
    }
    else {
        for(const entry of entries) {
            triggerDownload(entry.name, new Blob([entry.bytes]));
            await sleep(300);
        }
        destination = 'individual files';
    }
    logPrint(`${exported} message(s), ${entries.length} file(s) -> ${destination} : ${fileList}`);
})();
