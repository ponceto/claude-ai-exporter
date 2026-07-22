/*
 * background.js - Copyright (c) 2026 - Olivier Poncet
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

const CLAUDE_ORIGIN = 'https://claude.ai/';
const EXPORTER_SCRIPT = 'claude-ai-exporter.js';

chrome.action.onClicked.addListener((tab) => {
    if(!tab || typeof tab.id !== 'number') return;
    if(typeof tab.url !== 'string' || !tab.url.startsWith(CLAUDE_ORIGIN)) return;
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [EXPORTER_SCRIPT],
    });
});
