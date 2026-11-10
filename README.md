# pr-peek

A Claude Code mod that shows the merge state and CI status of GitHub pull requests linked in the chat. The link itself shows the merge state, in your theme's colors:

- Open: green
- Draft: gray italic
- Merged: purple, followed by `(merged)`
- Closed: gray strikethrough

Open and draft PRs also get a CI mark after the link: `✓` passing, `✗` failing, `◐` running. The mark links to the PR's checks page.

In places Claude Code draws as plain text (your own messages and tables), the status is added as text instead, like `(merged)` or `✓`. Links inside code blocks are left alone.

It looks each PR up with your own `gh` login, so private repositories work too. A status is checked when its link is first drawn and re-checked when it is more than 30 seconds old, either as the link is drawn again or when you send a new message. It needs the [GitHub CLI](https://cli.github.com) installed and signed in.

## Install

At the prompt of a terminal session:

```
/plugin install pr-peek --marketplace adrianthedev/pr-peek
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install pr-peek --marketplace adrianthedev/pr-peek
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `adrianthedev/pr-peek`, then Add plugin.
