# Upstream provenance

This repository began from the open source Claudex v1.6.2 snapshot published as
[BeamoINT/Claudex v1.6.2](https://github.com/BeamoINT/Claudex/releases/tag/v1.6.2).
The imported source reference is
`13d30ab9b1797170afc33aae295f0354ae36a37f`. Its source archive SHA-256 is
`d55bb164d24bb2503ede6522e62bd90be2c3b1f47029be880db2eda1daa269ae`.
The unmodified snapshot is preserved as the first commit in this repository.

The independent distribution keeps the useful cross platform launcher,
isolated profile, official Codex login, session resume, skill bridge, doctor,
update, and argument forwarding behavior. It changes the public name and
configuration namespace to avoid collision with the upstream command.

The GICC bridge starts from
[CLIProxyAPI v7.2.91](https://github.com/router-for-me/CLIProxyAPI/releases/tag/v7.2.91)
at commit `fde40c5a0a2f8f6808bcde498bc6079f32c355ef`. The verified source archive,
patch list, build inputs, and release asset digests are recorded in
[`proxy/manifest.json`](proxy/manifest.json).

This project is maintained independently. Upstream authors are not responsible
for its patches, releases, support, or compatibility claims.
