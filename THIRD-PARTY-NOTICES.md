# Third-party notices

Habit Tracker uses the Rust crates identified in Cargo.lock. Their individual
licenses apply; the project's MIT license does not replace them. See
docs/dependencies.md and `cargo deny --locked list` for the dependency inventory.

The Mozilla trust-anchor data supplied by webpki-root-certs 1.0.11 (transitively
through rustls-platform-verifier / Reqwest) is distributed under the Community
Data License Agreement – Permissive, Version 2.0. The unmodified license text
from that crate is supplied in licenses/CDLA-Permissive-2.0.txt and also included
in the Docker image under /usr/share/doc/habit-tracker/licenses/.

The Debian runtime retains its packages' copyright/license files under
/usr/share/doc/. Before distributing a release beyond this development build,
review the license/notice requirements of the complete locked dependency set.
