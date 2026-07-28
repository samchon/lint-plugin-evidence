# Safety-authorization pin fixtures

The production validator applies `safety-authorization.schema.json` to `pins.json.safetyAuthorization`, then enforces each wave as an all-or-none authorization. A ready wave has positive subject token and wall limits for both subjects plus positive block token and wall limits; an unready wave has all six values null.

Because each wave runs both arms, a block token or wall value may not exceed twice the sum of its two subject values. Selecting a wave whose six values remain null fails closed. All-null pins are the valid repository default and authorize no paid launch.
