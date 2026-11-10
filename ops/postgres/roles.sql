-- Run manually with the dedicated app database owner AFTER migrations.
-- psql variable :runtime_role and :worker_role are quoted as identifiers.
-- Roles/passwords are created interactively via \password, never here.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"runtime_role", :"worker_role";
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO :"runtime_role", :"worker_role";
REVOKE ALL ON schema_migrations FROM :"runtime_role", :"worker_role";
GRANT SELECT ON schema_migrations TO :"runtime_role", :"worker_role";
REVOKE ALL ON auth_user,auth_account,auth_session,auth_verification,auth_login_budget FROM :"runtime_role", :"worker_role";
GRANT SELECT ON auth_user,auth_account TO :"runtime_role";
GRANT SELECT,INSERT,UPDATE,DELETE ON auth_session,auth_login_budget TO :"runtime_role";
-- Runtime cannot create owners, change credentials or administer schema.
-- Most operational application tables still share broad CRUD within each role.
