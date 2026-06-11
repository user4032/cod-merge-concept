I wanted to share a feature idea that I think a lot of players would appreciate: a Cross-Account Merge tool for Warzone.

The issue is straightforward — many players have content split across two Activision accounts (for example, one linked to Xbox and one to Steam). Right now there's no way to bring that content together, and it's one of the most common frustrations in the community.

The idea: a one-time merge tool where the player selects a primary account and chooses how each content type is handled — merge unique skins, take the higher level, sum up stats, and so on. The secondary account gets deactivated after the process.

I've actually put together a working technical concept for this:
- A preview step that shows exactly what will change before anything happens
- All merge operations run inside a single database transaction (full rollback if anything fails)
- Ownership check to ensure both accounts belong to the same user

Happy to share the full prototype or technical spec if it's useful.
