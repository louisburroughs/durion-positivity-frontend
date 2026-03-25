#!/bin/bash

# Extract all zip archives under a design directory.
# - Duplicate DESIGN.md files are skipped.
# - Any other filename collision is renamed with the zip basename suffix.

set -euo pipefail

readonly SCRIPT_NAME="$(basename "$0")"
readonly DEFAULT_ROOT="$(pwd)"

ROOT_DIR="$DEFAULT_ROOT"
DRY_RUN="false"
declare -A PLANNED_PATHS=()

usage() {
    cat <<EOF
Usage: $SCRIPT_NAME [--root <path>] [--dry-run] [--help]

Extract all .zip files found recursively under the target root directory.

Options:
  --root <path>  Root directory to scan for zip files (default: current directory)
  --dry-run      Print planned actions without writing files
  -h, --help     Show this help
EOF
}

log() {
    echo "$*"
}

error() {
    echo "Error: $*" >&2
}

require_cmd() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        error "required command not found: $cmd"
        exit 1
    fi
}

split_name() {
    local filename="$1"
    local stem="${filename%.*}"
    local ext=""
    if [[ "$filename" == *.* && "$stem" != "$filename" ]]; then
        ext=".${filename##*.}"
    else
        stem="$filename"
    fi
    printf '%s\n%s\n' "$stem" "$ext"
}

resolve_collision_path() {
    local parent_dir="$1"
    local filename="$2"
    local zip_base="$3"

    local parts
    parts="$(split_name "$filename")"
    local stem
    stem="$(echo "$parts" | sed -n '1p')"
    local ext
    ext="$(echo "$parts" | sed -n '2p')"

    local candidate="${parent_dir}/${stem}__${zip_base}${ext}"
    if ! is_taken "$candidate"; then
        printf '%s\n' "$candidate"
        return
    fi

    local i=2
    while :; do
        candidate="${parent_dir}/${stem}__${zip_base}_${i}${ext}"
        if ! is_taken "$candidate"; then
            printf '%s\n' "$candidate"
            return
        fi
        ((i++))
    done
}

is_taken() {
    local path="$1"
    [[ -e "$path" || -n "${PLANNED_PATHS[$path]:-}" ]]
}

mark_taken() {
    local path="$1"
    PLANNED_PATHS["$path"]=1
}

extract_one_zip() {
    local zip_path="$1"

    local zip_dir
    zip_dir="$(dirname "$zip_path")"
    local zip_name
    zip_name="$(basename "$zip_path")"
    local zip_base="${zip_name%.zip}"

    local temp_dir
    temp_dir="$(mktemp -d)"
    trap 'rm -rf "$temp_dir"' RETURN

    unzip -qq -o "$zip_path" -d "$temp_dir"

    while IFS= read -r -d '' extracted_file; do
        local rel_path
        rel_path="${extracted_file#"$temp_dir"/}"

        local target_path="${zip_dir}/${rel_path}"
        local target_parent
        target_parent="$(dirname "$target_path")"
        local target_name
        target_name="$(basename "$target_path")"

        if [[ ! -d "$target_parent" ]]; then
            if [[ "$DRY_RUN" == "true" ]]; then
                log "mkdir -p $target_parent"
            else
                mkdir -p "$target_parent"
            fi
        fi

        if ! is_taken "$target_path"; then
            if [[ "$DRY_RUN" == "true" ]]; then
                log "extract: $zip_path -> $target_path"
            else
                mv "$extracted_file" "$target_path"
            fi
            mark_taken "$target_path"
            continue
        fi

        if [[ "$target_name" == "DESIGN.md" ]]; then
            log "skip duplicate DESIGN.md from $zip_path at $target_path"
            continue
        fi

        local renamed_target
        renamed_target="$(resolve_collision_path "$target_parent" "$target_name" "$zip_base")"

        if [[ "$DRY_RUN" == "true" ]]; then
            log "rename collision: $zip_path -> $renamed_target"
        else
            mv "$extracted_file" "$renamed_target"
        fi
        mark_taken "$renamed_target"
    done < <(find "$temp_dir" -type f -print0)

    rm -rf "$temp_dir"
    trap - RETURN
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --root)
                if [[ $# -lt 2 ]]; then
                    error "missing value for --root"
                    exit 1
                fi
                ROOT_DIR="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                error "unknown argument: $1"
                usage
                exit 1
                ;;
        esac
    done
}

main() {
    require_cmd unzip
    require_cmd find
    require_cmd mktemp

    if [[ ! -d "$ROOT_DIR" ]]; then
        error "root directory not found: $ROOT_DIR"
        exit 1
    fi

    local zip_count=0
    while IFS= read -r -d '' zip_file; do
        ((++zip_count))
        log "processing: $zip_file"
        extract_one_zip "$zip_file"
    done < <(find "$ROOT_DIR" -type f -name '*.zip' -print0 | sort -z)

    if [[ $zip_count -eq 0 ]]; then
        log "no zip files found under $ROOT_DIR"
        return
    fi

    log "completed. processed $zip_count zip file(s)."
}

parse_args "$@"
main
