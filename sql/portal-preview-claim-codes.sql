-- Run in the Supabase project used by portal.steadyhandsop.com.
-- Preview claim codes are single-use. Do not expose or publish them in public source code.
create extension if not exists pgcrypto;
create table if not exists public.portal_preview_invites (
 id uuid primary key default gen_random_uuid(),
 code_hash text not null unique,
 site_key text not null,
 site_title text not null default 'Your Website Preview',
 preview_url text not null,
 claimed_by uuid references auth.users(id) on delete set null,
 claimed_at timestamptz,
 expires_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.portal_preview_claims (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 site_key text not null,
 site_title text not null,
 preview_url text not null,
 invite_id uuid not null unique references public.portal_preview_invites(id),
 created_at timestamptz not null default now(),
 unique(user_id,site_key)
);
alter table public.portal_preview_invites enable row level security;
alter table public.portal_preview_claims enable row level security;
drop policy if exists "Client can read own claimed previews" on public.portal_preview_claims;
create policy "Client can read own claimed previews" on public.portal_preview_claims
for select to authenticated using (user_id=(select auth.uid()));
grant select on public.portal_preview_claims to authenticated;
create or replace function public.claim_portal_preview(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.portal_preview_invites%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if length(trim(coalesce(p_code,''))) < 16 or length(p_code)>160 then raise exception 'Invalid preview code'; end if;
 select * into v from public.portal_preview_invites
 where code_hash=encode(extensions.digest(trim(p_code),'sha256'),'hex') for update;
 if not found then raise exception 'Preview code not found'; end if;
 if v.expires_at is not null and v.expires_at < now() then raise exception 'Preview code has expired'; end if;
 if v.claimed_by is not null and v.claimed_by <> auth.uid() then raise exception 'This preview code has already been claimed'; end if;
 if v.claimed_by is null then
   update public.portal_preview_invites set claimed_by=auth.uid(),claimed_at=now() where id=v.id;
 end if;
 insert into public.portal_preview_claims(user_id,site_key,site_title,preview_url,invite_id)
 values(auth.uid(),v.site_key,v.site_title,v.preview_url,v.id)
 on conflict (invite_id) do nothing;
 return jsonb_build_object('site_key',v.site_key,'site_title',v.site_title);
end $$;
revoke all on function public.claim_portal_preview(text) from public;
grant execute on function public.claim_portal_preview(text) to authenticated;
-- Only Steady Hands admins may generate codes.
create or replace function public.create_portal_preview_invite(p_site_key text,p_site_title text,p_preview_url text)
returns text language plpgsql security definer set search_path='' as $$
declare v_code text;
begin
 if not exists(select 1 from public.team_permissions p where p.user_id=auth.uid() and p.active=true and upper(p.role::text)='ADMIN')
 then raise exception 'Admin access required'; end if;
 if length(trim(coalesce(p_site_key,'')))<3 or p_preview_url not like 'https://%'
 then raise exception 'A valid site key and HTTPS preview URL are required'; end if;
 v_code:=encode(extensions.gen_random_bytes(24),'hex');
 insert into public.portal_preview_invites(code_hash,site_key,site_title,preview_url,expires_at)
 values(encode(extensions.digest(v_code,'sha256'),'hex'),trim(p_site_key),coalesce(nullif(trim(p_site_title),''),'Your Website Preview'),trim(p_preview_url),now()+interval '60 days');
 return 'https://portal.steadyhandsop.com/login.html?preview_code='||v_code;
end $$;
revoke all on function public.create_portal_preview_invite(text,text,text) from public;
grant execute on function public.create_portal_preview_invite(text,text,text) to authenticated;
