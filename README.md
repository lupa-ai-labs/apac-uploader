# apac-uploader

A tiny Cloudflare Worker + Durable Object that **relays a file from a source URL
into a presigned PUT** — running from an edge region close to the *target*, so
the slow transfer happens near the destination instead of over a long
cross-region hop.

We built this at [Lupa AI](https://lupa.art) to push trained LoRA files into
[RunningHub](https://www.runninghub.ai)'s object storage in **Beijing**: our
training runs outside China, so the direct cross-border PUT crawled (~95 KB/s,
minutes per file), while routing it through a Durable Object pinned near Beijing
made it a short in-region hop.

## Use

```
POST /
{
  "secret":     "<must match env SECRET>",
  "sourceUrl":  "https://example.com/big-file.bin",
  "sourceAuth": "Bearer …",            // optional Authorization for the source fetch
  "targetUrl":  "https://bucket.example.com/key?<presigned-put-signature>"
}
```

→

```json
{ "ok": true, "colo": "HKG", "bytes": 91234567, "status": 200, "error": null, "seconds": 11.4 }
```

The `LOCATION_HINT` var picks the region to run from (default `apac`); it accepts
any Cloudflare Durable Object location hint: `wnam`, `enam`, `sam`, `weur`,
`eeur`, `apac`, `oc`, `afr`, `me`.

## ⚠️ Size limit

Cloudflare aborts a Worker's **outbound** subrequest body at ~100 MB (returns
`413` + `"Network connection lost"`), and a Durable Object can't buffer more than
its 128 MB memory. **This only works for files under ~100 MB.** For larger
files you need a full compute node in-region (a small VM / function), not a
Worker.

## Deploy

```bash
pnpm install
wrangler secret put SECRET     # the shared secret callers must present
wrangler deploy
```

If `workers.dev` is disabled on your account, add a route in `wrangler.jsonc`
(e.g. a `custom_domain`) so the Worker is reachable.

## License

MIT — see [LICENSE](./LICENSE).
