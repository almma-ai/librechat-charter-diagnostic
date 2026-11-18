# Framework map

Map v0.1.0, **unreviewed**. This mapping has not yet been reviewed clause by clause by a lawyer or an accredited ISO/IEC 42001 auditor. It is not legal advice and not a conformity assessment.

Each row is a requirement an AI governance team looks for, the clauses of the EU AI Act (Regulation (EU) 2024/1689 as amended by Regulation (EU) 2026/1744), ISO/IEC 42001:2023 Annex A and NIST AI RMF 1.0 (AI 100-1) it touches, and which Delegation Charter fields and diagnostic checks produce evidence for it. The diagnostic evaluates these rows in `lib/frameworks.js` and writes the result to `framework-gaps.json` and the report section *Your gaps against the EU AI Act*.

## When the EU AI Act applies

- AI literacy (Art. 4) and prohibited practices (Art. 5): since 2 February 2025.
- Transparency to people interacting with AI (Art. 50): since 2 August 2026.
- High-risk obligations for Annex III uses (Arts. 9-15, 26): from 2 December 2027, as amended by Regulation (EU) 2026/1744.

Most rows below become legal duties only for agents used in a high-risk area listed in Annex III (for example hiring, education access, credit scoring, essential services). The diagnostic cannot tell what an agent is used for, so it never says a deployment is compliant. ISO/IEC 42001 and the NIST AI RMF are voluntary.

## The map

| Requirement | Duty on | EU AI Act | ISO/IEC 42001 | NIST AI RMF | Evidence in the charter and diagnostic |
| --- | --- | --- | --- | --- | --- |
| An inventory of AI agents | deployer | **Art. 26 (whole)** Not a separate duty in the Act, but a deployer cannot meet Art. 26 for systems it has not listed. | A.4.2 | GOVERN 1.6 | Diagnostic agent list; charter `owner` |
| A documented purpose and limits for each agent | provider and deployer | **Art. 26(1)** Use the system according to its instructions for use.<br>**Art. 13(3)(b)** Provider states intended purpose and limitations. | A.9.4 | MAP 1.1 | Charter `purpose`, `scope.will_do`, `scope.never_do`; checks Purpose, Pillar 4 |
| Named people responsible for human oversight | deployer | **Art. 26(2)** Assign oversight to people with the competence, training, authority and support to do it. | A.3.2 | GOVERN 2.1, GOVERN 3.2 | Charter `owner`, `escalation_recipient`, `approval_authority`; Pillars 1-3 |
| Ability to override, hold or stop an agent | provider and deployer | **Art. 14(4)(d)-(e)** Overseers can decide not to use, override or reverse output, and halt the system safely.<br>**Art. 26(5)** Deployer suspends use when it has reason to believe there is a risk. | A.9.2 | MANAGE 2.4 | Charter `constraints`, `state`; Pillar 8; conformance *Hold irreversible actions* |
| Escalation to a person when an agent is out of bounds | provider and deployer | **Art. 14(4)(a)** Overseers can monitor operation and detect anomalies. | A.3.3 | MAP 3.5 | Charter `escalation_rules`, `escalation_recipient`; Pillar 7; conformance *Route escalations* |
| Automatic logs of what agents did | provider and deployer | **Art. 12** High-risk systems allow automatic recording of events over their lifetime (provider design duty).<br>**Art. 26(6)** Deployer keeps the logs under its control. | A.6.2.8 | MANAGE 4.1 | Observer records; conformance *Link records to charter version* |
| Keeping agent logs for at least six months | provider and deployer | **Art. 26(6)** Deployers keep logs at least six months unless other law (e.g. GDPR) requires otherwise.<br>**Art. 19(1)** Same minimum for providers. | A.6.2.8 | — | `CHARTER_DIAG_RETENTION_DAYS` |
| Monitoring agents in operation and catching drift | provider and deployer | **Art. 26(5)** Deployers monitor operation and inform the provider of risks or serious incidents.<br>**Art. 72** Provider post-market monitoring. | A.6.2.6 | MANAGE 4.1 | Conformance *Flag drift*, *Independent read* |
| Version history and change control for agents | provider | **Art. 11 and Annex IV** Technical documentation kept up to date (provider). | A.6.2.7 | — | Charter `id`, `version`; lifecycle *Changed after sharing*; conformance *Keep every version*, *Return to Draft on change* |
| Agents limited to the tools they need | provider and deployer | **Art. 9(2)** Risk management: identify and mitigate foreseeable risks.<br>**Art. 15(5)** Resilience against misuse of the system (cybersecurity). | A.4.2, A.9.2 | — | Charter `systems` (access class per tool); Pillar 5; conformance *Deny unlisted tools* |
| Telling people they are dealing with AI, and its limits | provider and deployer | **Art. 50(1)** People are informed they are interacting with an AI system (provider design duty), in force since 2 August 2026.<br>**Art. 26(11)** Annex III deployers inform affected persons. | A.8.2 | — | Conformance *Show users the terms* |
| Periodic review and retirement of agents | deployer | **Art. 26(5)** Suspend use where a risk is identified. | A.6.2.6 | GOVERN 1.5, GOVERN 1.7 | Charter `review_date`, `state`; lifecycle *Dormant but shared* |
| Knowing which agents are high-risk under the Act | provider and deployer | **Art. 6 and Annex III** High-risk uses include hiring, education access, credit, essential services. | A.5.2 | MAP 1.1 | Charter `purpose` (to be answered by a person) |
| AI literacy of the people using agents | provider and deployer | **Art. 4** Measures for sufficient AI literacy of staff (softened by Regulation (EU) 2026/1744). | A.4.6 | GOVERN 2.2 | Not observable by the diagnostic |

## Help check it

The clause references were checked against the published texts, but no lawyer or accredited auditor has reviewed whether each row is right. Corrections are welcome as issues or pull requests; each one should cite the clause text it relies on.
