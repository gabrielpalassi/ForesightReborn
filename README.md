<h1><img src="docs/assets/logo.svg" alt="" width="48" height="48" align="absmiddle"> Foresight Reborn</h1>

Foresight Reborn makes empty workspaces immediately useful by opening the Activities overview automatically, keeping your apps and search ready for whatever comes next.

It reacts to window and workspace events, so there is no polling and no configuration. The overview opens when you switch to an empty workspace or close its last window, and closes when you open a window or leave that workspace. An overview opened manually is never closed by the extension.

## Why Foresight Reborn?

Foresight Reborn began as a response to long waits for important fixes in the original Foresight extension. It takes the original's useful idea further with more responsive maintenance and a smoother, more reliable experience:

- Smoother workspace switching with the keyboard, touchpad, or mouse.
- More reliable behavior across multiple monitors and primary-only workspaces.
- Correct overview behavior when launching apps with keyboard shortcuts.
- Better handling of splash screens, updaters, and other temporary windows.
- A smoother transition to the overview after closing the last window.
- Fewer unexpected overview changes when switching workspaces quickly.

## Installation

The recommended installation method is through the [Extension Manager](https://flathub.org/apps/com.mattjakeman.ExtensionManager) app. Open its **Browse** tab, search for **Foresight Reborn**, and select **Install**.

Alternatively, install it directly from the GNOME Extensions website:

<a href="https://extensions.gnome.org/extension/10389/foresight-reborn/">
  <img src="docs/assets/ego.svg" alt="Download from extensions.gnome.org" width="210" height="60">
</a>

### Install from source

Foresight Reborn supports GNOME Shell 46 through 50. Before installing, make sure the following tools are available:

- Node.js and npm
- The `gnome-extensions` command-line tool, usually provided by your distribution's GNOME Shell package

Clone the repository, install the development dependencies, and build and install the extension:

```bash
git clone https://github.com/gabrielpalassi/ForesightReborn.git
cd ForesightReborn
npm ci
npm run all
gnome-extensions enable foresight-reborn@gabrielpalassi.github.io
```

`npm run all` creates the extension archive in `dist/` and installs it for the current user. You can also enable **Foresight Reborn** using the Extensions or Extension Manager application.

If GNOME Shell does not detect the extension immediately, log out and back in, then run the enable command again. To update an existing source installation:

```bash
git pull
npm ci
npm run all
gnome-extensions enable foresight-reborn@gabrielpalassi.github.io
```

## Development

Install the dependencies with `npm ci` before using the development commands.

```bash
npm run build              # create the extension archive in dist/
npm run setup              # reinstall the most recent archive locally
npm run all                # build and reinstall in one step

npm run start              # launch a nested GNOME Shell session
npm run start:multimonitor # launch a nested session with two virtual monitors

npm run fmt-lint           # check formatting and lint rules
npm run fmt-lint:fix       # automatically fix formatting and lint issues
```

After changing the extension, run `npm run all` before testing it. The nested multi-monitor session is useful for checking workspace behavior with **Workspaces on primary display only** enabled.

## Contributing

Contributions are welcome. The expected development flow is:

1. Fork the repository and create a focused branch from the latest default branch.
2. Install dependencies with `npm ci`.
3. Make your changes, keeping each pull request limited to one clear concern.
4. Run `npm run fmt-lint` and fix any reported formatting or lint issues.
5. Run `npm run all`, then test the extension in a nested GNOME Shell session with `npm run start` or `npm run start:multimonitor` as appropriate.
6. Commit the changes and open a pull request describing what changed, why it changed, and how it was tested.

Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages:

```text
<type>: <short description>
```

Write the description in the imperative mood, keep it concise, and omit the trailing period. Common types include:

- `feat`: add user-facing functionality
- `fix`: correct a bug
- `docs`: update documentation only
- `refactor`: restructure code without changing behavior
- `style`: make formatting-only changes
- `test`: add or update tests
- `chore`: perform maintenance or release work

For example: `fix: preserve manually opened overview`. Use a commit body when the reason for a change or an important implementation detail is not clear from the subject alone.

## Credits

Foresight Reborn is a fork of [Foresight](https://github.com/pesader/gnome-shell-extension-foresight), created by [pesader](https://github.com/pesader). The original project was itself based on [Show Application View When Workspace Empty](https://github.com/fawtytoo/GnomeShellExtensions/tree/main/show_applications_instead_of_overview%40fawtytoo%20%283.38%E2%80%9343%29) by [fawtytoo](https://github.com/fawtytoo).

The visual assets retain the upstream project's credits: artwork derived from GNOME Snapshot, Snowglobe, GNOME Shell, Extension Manager, and Just Perfection.

## License

This project is licensed under the terms of the [GPL-3.0](./LICENSE)
