begin;

-- Workaround (action_21) only stores a marker; the current free-text final audit
-- does not apply an exclusion rule. Safe Boot (action_25) stores a round flag,
-- but Vulnerability cards do not yet have formal, enforceable effects to disable.
-- Keep their source text and handlers for later completion, but do not let players
-- use them as if their effects were fully implemented.

update public.card_catalog
set effect_status = 'draft',
    effect_handler_id = null
where catalog_version = 'v1'
  and (
    (card_id = 'action_21' and effect_handler_id = 'workaround_ignore_crisis_in_audit')
    or
    (card_id = 'action_25' and effect_handler_id = 'safe_boot_disable_vulnerabilities_round')
  );

commit;
