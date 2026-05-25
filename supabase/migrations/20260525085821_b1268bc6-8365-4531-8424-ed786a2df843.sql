-- Allow assigned drivers to update vehicles they are assigned to
-- (needed to record current_km and plate_photo_path during fueling).
-- Scope: same company + active assignment. Does not affect manager/super_admin policies.
CREATE POLICY "drivers update assigned vehicle"
ON public.vehicles
FOR UPDATE
TO authenticated
USING (
  is_company_member(auth.uid(), company_id)
  AND EXISTS (
    SELECT 1 FROM public.vehicle_assignments va
    WHERE va.vehicle_id = vehicles.id
      AND va.user_id = auth.uid()
  )
)
WITH CHECK (
  is_company_member(auth.uid(), company_id)
  AND EXISTS (
    SELECT 1 FROM public.vehicle_assignments va
    WHERE va.vehicle_id = vehicles.id
      AND va.user_id = auth.uid()
  )
);