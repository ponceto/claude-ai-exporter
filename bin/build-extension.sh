#!/bin/bash
#
# build-extension - Copyright (c) 2026 - Olivier Poncet
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 2 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.
#

# ----------------------------------------------------------------------------
# command-line arguments
# ----------------------------------------------------------------------------

case "${1:-}" in
    chrome|firefox)
        ;;
    *)
        echo "usage: ${0} {chrome|firefox}" >&2
        exit 1
        ;;
esac

# ----------------------------------------------------------------------------
# global variables
# ----------------------------------------------------------------------------

BROWSER="${1}"
PACKAGE='claude-ai-exporter'
TOPDIR="$(pwd)"
SRCDIR="${TOPDIR}/src"
TMPDIR="${TOPDIR}/tmp"
DSTDIR="${TMPDIR}/${BROWSER}"
ZIPFILE="${TMPDIR}/${PACKAGE}-${BROWSER}.zip"

# ----------------------------------------------------------------------------
# debug
# ----------------------------------------------------------------------------

set -x

# ----------------------------------------------------------------------------
# cleanup
# ----------------------------------------------------------------------------

rm -rf "${DSTDIR}" "${ZIPFILE}"                                      || exit 1

# ----------------------------------------------------------------------------
# create target directory
# ----------------------------------------------------------------------------

mkdir -p "${DSTDIR}"                                                 || exit 1

# ----------------------------------------------------------------------------
# build extension
# ----------------------------------------------------------------------------

cp "${SRCDIR}/extension/manifest.${BROWSER}.json" "${DSTDIR}/manifest.json" || exit 1
cp "${SRCDIR}/extension/background.js"            "${DSTDIR}/background.js" || exit 1
cp "${SRCDIR}/${PACKAGE}.js"                      "${DSTDIR}/${PACKAGE}.js" || exit 1
cp -r "${SRCDIR}/extension/icons"                 "${DSTDIR}/icons"         || exit 1

# ----------------------------------------------------------------------------
# move to the target directory
# ----------------------------------------------------------------------------

cd "${DSTDIR}"                                                       || exit 1

# ----------------------------------------------------------------------------
# build zip file
# ----------------------------------------------------------------------------

zip -r "${ZIPFILE}" .                                                || exit 1

# ----------------------------------------------------------------------------
# End-Of-File
# ----------------------------------------------------------------------------
