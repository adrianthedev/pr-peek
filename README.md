# pr-peek

A Claude Code mod that shows the status of GitHub pull requests linked in the chat, right after each link:

- ✅ merged
- 🔄 open
- 📝 draft
- ❌ closed
- ❔ couldn't check

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
