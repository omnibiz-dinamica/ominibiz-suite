-- Garante dependencias operacionais para o encerramento do ponto.
-- Não altera RLS, permissões, regras de geofence ou dados de ponto.

-- Empresas antigas ou criadas antes do provisionamento de RH podem não ter
-- uma linha de configuração. O cálculo financeiro lê essa linha ao fechar
-- o ponto; os defaults da tabela preservam o comportamento atual.
INSERT INTO public.company_hr_settings (company_id)
SELECT c.id
  FROM public.companies c
 WHERE NOT EXISTS (
   SELECT 1
     FROM public.company_hr_settings s
    WHERE s.company_id = c.id
 );

-- A política deve continuar disponível mesmo que uma instalação ainda não
-- tenha a linha de RH. A consulta anterior retornava zero linhas e deixava
-- o RPC de stop dependente de NULL implícito.
CREATE OR REPLACE FUNCTION public._punch_resolve_policy(p_company uuid, p_client uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT jsonb_build_object(
    'radius_m', COALESCE(c.geo_radius_m, s.geo_default_radius_m, 50),
    'client_lat', c.geo_lat,
    'client_lng', c.geo_lng,
    'policy_start', COALESCE(s.geo_out_of_range_policy_start, 'alert'::geo_policy),
    'policy_stop', COALESCE(s.geo_out_of_range_policy_stop, 'alert'::geo_policy),
    'no_loc_start', COALESCE(s.geo_no_location_policy_start, 'alert'::geo_policy),
    'no_loc_stop', COALESCE(s.geo_no_location_policy_stop, 'alert'::geo_policy),
    'required_start', COALESCE(s.geo_required_start, false),
    'required_stop', COALESCE(s.geo_required_stop, false),
    'version', COALESCE(s.geo_policy_version, 1)
  )
    FROM public.companies co
    LEFT JOIN public.company_hr_settings s ON s.company_id = co.id
    LEFT JOIN public.clients c ON c.id = p_client AND c.company_id = p_company
   WHERE co.id = p_company;
$function$;
