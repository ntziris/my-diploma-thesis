# Η πύλη στο AWS

Το site ζει στο Walrus (testnet) και το αντικείμενό του στο Sui. Επειδή το testnet δεν
έχει δημόσια πύλη, η πύλη τρέχει σε δικό μας μικρό instance (`portal`, t3.small), σε
λειτουργία *bring your own domain*: ολόκληρο το domain σερβίρει το ένα site, χωρίς
subdomains. Το Caddy βγάζει πιστοποιητικό Let's Encrypt και προωθεί στην πύλη.

| Αρχείο | Ρόλος |
| --- | --- |
| `portal-config.yaml` | testnet, `bring_your_own_domain: true`, `landing_page_oid_b36` = το site |
| `docker-compose.yml` | portal (εσωτερική 3000) + caddy (80/443) |
| `Caddyfile` | `{$DOMAIN}` → `portal:3000` |
| `install.sh` | Docker, compose plugin, `docker compose up -d` |

Εγκατάσταση, από αυτό το μηχάνημα:

```
scp -i ~/.ssh/nautilus-key.pem -r Code/portal/aws ec2-user@<ip>:portal
ssh -i ~/.ssh/nautilus-key.pem ec2-user@<ip> 'DOMAIN=art-tokenization.duckdns.org bash portal/install.sh'
```

Το DNS όνομα (DuckDNS) πρέπει να δείχνει στην Elastic IP του instance πριν το πρώτο
https αίτημα, αλλιώς το Let's Encrypt αποτυγχάνει και το Caddy ξαναδοκιμάζει με backoff.

Νέα έκδοση του frontend: `scripts/deploy-site.sh` (build + `site-builder deploy`, που
ενημερώνει το ίδιο αντικείμενο site). Η πύλη δεν χρειάζεται καμία αλλαγή, διαβάζει το
αντικείμενο σε κάθε αίτημα.
