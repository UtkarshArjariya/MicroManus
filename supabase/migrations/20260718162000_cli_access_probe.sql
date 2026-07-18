-- Intentionally leaves the application schema unchanged. Its recorded remote
-- migration version proves that this repository can push through the CLI.
do $$
begin
  perform 1;
end
$$;
