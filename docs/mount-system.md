# Mount system

A **mount** is a mapping record, never a copy of the file.

## Rules

- The same original path may be mounted many times. Each node has its own selection, order, and detection flags.
- Folders always appear in the tree, even when they currently contain no playable media.
- Only playable image/video files are created as leaf nodes. Other files are ignored.
- Symlinks are resolved to a real path when the OS allows it.
- Parent → child cycles in the mount tree are rejected.

## Selection

Checking a folder recursively selects every descendant. Unchecking does the same. A parent checkbox is an “select all” intent; the playback pool uses leaf `selected` flags.

## Continuous detection

When a folder has detection enabled, **Refresh** scans the original directory:

- new playable files and subfolders become mount nodes
- nodes whose original path disappeared are removed
- unlocked children inherit the parent detection flag

When detection is off, missing files stay in the tree and render in red. They are skipped by the playback pool.

Refresh applies to the current folder subtree, or to every root folder when none is selected (“refresh all”).

## Delete

Default: delete mapping rows (`ON DELETE CASCADE` for children). Original files are untouched.

“Also delete original files” is a separate, confirmed path.
