export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          contract_id: string
          cost: number
          created_at: string
          credits_used: number
          id: string
          period_month: string
        }
        Insert: {
          contract_id: string
          cost?: number
          created_at?: string
          credits_used?: number
          id?: string
          period_month: string
        }
        Update: {
          contract_id?: string
          cost?: number
          created_at?: string
          credits_used?: number
          id?: string
          period_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_assignees: {
        Row: {
          client_id: string
          company_id: string
          created_at: string
          id: string
          is_primary: boolean
          user_id: string
        }
        Insert: {
          client_id: string
          company_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          user_id: string
        }
        Update: {
          client_id?: string
          company_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_assignees_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          billing_mode: string
          company_id: string
          created_at: string
          created_by: string | null
          daily_rate: number | null
          email: string | null
          fixed_rate: number | null
          geo_address: string | null
          geo_lat: number | null
          geo_lng: number | null
          geo_radius_m: number | null
          hourly_rate: number | null
          id: string
          mixed_base_fixed: number | null
          mixed_extra_hour_rate: number | null
          mixed_included_minutes: number | null
          monthly_rate: number | null
          name: string
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["client_status"]
          timing_mode: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          billing_mode?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          daily_rate?: number | null
          email?: string | null
          fixed_rate?: number | null
          geo_address?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          geo_radius_m?: number | null
          hourly_rate?: number | null
          id?: string
          mixed_base_fixed?: number | null
          mixed_extra_hour_rate?: number | null
          mixed_included_minutes?: number | null
          monthly_rate?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          timing_mode?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          billing_mode?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          daily_rate?: number | null
          email?: string | null
          fixed_rate?: number | null
          geo_address?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          geo_radius_m?: number | null
          hourly_rate?: number | null
          id?: string
          mixed_base_fixed?: number | null
          mixed_extra_hour_rate?: number | null
          mixed_included_minutes?: number | null
          monthly_rate?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          timing_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_client_contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          id: string
          is_primary_signer: boolean
          name: string
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary_signer?: boolean
          name: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary_signer?: boolean
          name?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "commercial_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_clients: {
        Row: {
          address: string | null
          city: string | null
          company_name: string
          contact_name: string | null
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          legal_name: string | null
          nif: string | null
          notes: string | null
          phone: string | null
          state: string | null
          status: Database["public"]["Enums"]["commercial_client_status"]
          tax_id_kind: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_name: string
          contact_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          nif?: string | null
          notes?: string | null
          phone?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["commercial_client_status"]
          tax_id_kind?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_name?: string
          contact_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          nif?: string | null
          notes?: string | null
          phone?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["commercial_client_status"]
          tax_id_kind?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          billing_addons_monthly: number
          billing_base_monthly: number
          billing_country: string
          billing_currency: string
          billing_cycle: string
          billing_notes: string | null
          billing_plan: string
          billing_trial_ends_at: string | null
          business_vertical: string
          country: string
          created_at: string
          created_by: string | null
          currency: string
          default_fixed_rate: number | null
          default_hourly_rate: number | null
          default_monthly_rate: number | null
          email_from_name: string | null
          employee_limit: number | null
          enabled_modules: string[]
          id: string
          language: string
          logo_url: string | null
          name: string
          primary_color: string | null
          slug: string
          status: Database["public"]["Enums"]["company_status"]
          timezone: string
          updated_at: string
          user_limit: number | null
        }
        Insert: {
          billing_addons_monthly?: number
          billing_base_monthly?: number
          billing_country?: string
          billing_currency?: string
          billing_cycle?: string
          billing_notes?: string | null
          billing_plan?: string
          billing_trial_ends_at?: string | null
          business_vertical?: string
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          default_fixed_rate?: number | null
          default_hourly_rate?: number | null
          default_monthly_rate?: number | null
          email_from_name?: string | null
          employee_limit?: number | null
          enabled_modules?: string[]
          id?: string
          language?: string
          logo_url?: string | null
          name: string
          primary_color?: string | null
          slug: string
          status?: Database["public"]["Enums"]["company_status"]
          timezone?: string
          updated_at?: string
          user_limit?: number | null
        }
        Update: {
          billing_addons_monthly?: number
          billing_base_monthly?: number
          billing_country?: string
          billing_currency?: string
          billing_cycle?: string
          billing_notes?: string | null
          billing_plan?: string
          billing_trial_ends_at?: string | null
          business_vertical?: string
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          default_fixed_rate?: number | null
          default_hourly_rate?: number | null
          default_monthly_rate?: number | null
          email_from_name?: string | null
          employee_limit?: number | null
          enabled_modules?: string[]
          id?: string
          language?: string
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["company_status"]
          timezone?: string
          updated_at?: string
          user_limit?: number | null
        }
        Relationships: []
      }
      company_hr_settings: {
        Row: {
          billing_active: boolean
          company_id: string
          default_daily_rate: number
          default_fixed_rate: number
          default_hour_rate: number
          default_mixed_base_fixed: number
          default_mixed_extra_hour_rate: number
          default_mixed_included_minutes: number
          default_monthly_rate: number
          default_punch_mode: Database["public"]["Enums"]["punch_mode"]
          default_support_manager_id: string | null
          employee_approver_kind: Database["public"]["Enums"]["employee_approver_kind"]
          employee_approver_user_id: string | null
          geo_default_radius_m: number
          geo_no_location_policy_start: Database["public"]["Enums"]["geo_policy"]
          geo_no_location_policy_stop: Database["public"]["Enums"]["geo_policy"]
          geo_out_of_range_policy_start: Database["public"]["Enums"]["geo_policy"]
          geo_out_of_range_policy_stop: Database["public"]["Enums"]["geo_policy"]
          geo_photo_start_enabled: boolean
          geo_photo_stop_enabled: boolean
          geo_policy_version: number
          geo_required_start: boolean
          geo_required_stop: boolean
          manager_approver_kind: Database["public"]["Enums"]["manager_approver_kind"]
          manager_approver_user_id: string | null
          overtime_multiplier: number
          overtime_threshold_minutes: number
          updated_at: string
        }
        Insert: {
          billing_active?: boolean
          company_id: string
          default_daily_rate?: number
          default_fixed_rate?: number
          default_hour_rate?: number
          default_mixed_base_fixed?: number
          default_mixed_extra_hour_rate?: number
          default_mixed_included_minutes?: number
          default_monthly_rate?: number
          default_punch_mode?: Database["public"]["Enums"]["punch_mode"]
          default_support_manager_id?: string | null
          employee_approver_kind?: Database["public"]["Enums"]["employee_approver_kind"]
          employee_approver_user_id?: string | null
          geo_default_radius_m?: number
          geo_no_location_policy_start?: Database["public"]["Enums"]["geo_policy"]
          geo_no_location_policy_stop?: Database["public"]["Enums"]["geo_policy"]
          geo_out_of_range_policy_start?: Database["public"]["Enums"]["geo_policy"]
          geo_out_of_range_policy_stop?: Database["public"]["Enums"]["geo_policy"]
          geo_photo_start_enabled?: boolean
          geo_photo_stop_enabled?: boolean
          geo_policy_version?: number
          geo_required_start?: boolean
          geo_required_stop?: boolean
          manager_approver_kind?: Database["public"]["Enums"]["manager_approver_kind"]
          manager_approver_user_id?: string | null
          overtime_multiplier?: number
          overtime_threshold_minutes?: number
          updated_at?: string
        }
        Update: {
          billing_active?: boolean
          company_id?: string
          default_daily_rate?: number
          default_fixed_rate?: number
          default_hour_rate?: number
          default_mixed_base_fixed?: number
          default_mixed_extra_hour_rate?: number
          default_mixed_included_minutes?: number
          default_monthly_rate?: number
          default_punch_mode?: Database["public"]["Enums"]["punch_mode"]
          default_support_manager_id?: string | null
          employee_approver_kind?: Database["public"]["Enums"]["employee_approver_kind"]
          employee_approver_user_id?: string | null
          geo_default_radius_m?: number
          geo_no_location_policy_start?: Database["public"]["Enums"]["geo_policy"]
          geo_no_location_policy_stop?: Database["public"]["Enums"]["geo_policy"]
          geo_out_of_range_policy_start?: Database["public"]["Enums"]["geo_policy"]
          geo_out_of_range_policy_stop?: Database["public"]["Enums"]["geo_policy"]
          geo_photo_start_enabled?: boolean
          geo_photo_stop_enabled?: boolean
          geo_policy_version?: number
          geo_required_start?: boolean
          geo_required_stop?: boolean
          manager_approver_kind?: Database["public"]["Enums"]["manager_approver_kind"]
          manager_approver_user_id?: string | null
          overtime_multiplier?: number
          overtime_threshold_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_hr_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_audit_events: {
        Row: {
          actor_id: string | null
          contract_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
        }
        Insert: {
          actor_id?: string | null
          contract_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          actor_id?: string | null
          contract_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "contract_audit_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_services: {
        Row: {
          config: Json
          contract_id: string
          created_at: string
          id: string
          service: Database["public"]["Enums"]["contract_service"]
        }
        Insert: {
          config?: Json
          contract_id: string
          created_at?: string
          id?: string
          service: Database["public"]["Enums"]["contract_service"]
        }
        Update: {
          config?: Json
          contract_id?: string
          created_at?: string
          id?: string
          service?: Database["public"]["Enums"]["contract_service"]
        }
        Relationships: [
          {
            foreignKeyName: "contract_services_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          body: string | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          pdf_path: string | null
          placeholder_map: Json
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          body?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          pdf_path?: string | null
          placeholder_map?: Json
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          body?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          pdf_path?: string | null
          placeholder_map?: Json
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      contract_workflow: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          contract_id: string
          created_at: string
          due_at: string | null
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["workflow_step_status"]
          step: Database["public"]["Enums"]["workflow_step"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          contract_id: string
          created_at?: string
          due_at?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["workflow_step_status"]
          step: Database["public"]["Enums"]["workflow_step"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          contract_id?: string
          created_at?: string
          due_at?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["workflow_step_status"]
          step?: Database["public"]["Enums"]["workflow_step"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_workflow_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          auto_renew: boolean
          billing_cycle: string
          client_id: string
          contract_data: Json
          created_at: string
          created_by: string | null
          credits_limit: number
          end_date: string | null
          id: string
          jurisdiction: string | null
          monthly_fee: number
          notes: string | null
          notice_days: number
          pdf_path: string | null
          plan_name: string
          promo_fee: number | null
          promo_months: number
          rendered_body: string | null
          sign_expires_at: string | null
          sign_token: string | null
          signature_hash: string | null
          signed_at: string | null
          signed_ip: unknown
          signed_user_agent: string | null
          signer_name: string | null
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          template_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          billing_cycle?: string
          client_id: string
          contract_data?: Json
          created_at?: string
          created_by?: string | null
          credits_limit?: number
          end_date?: string | null
          id?: string
          jurisdiction?: string | null
          monthly_fee?: number
          notes?: string | null
          notice_days?: number
          pdf_path?: string | null
          plan_name: string
          promo_fee?: number | null
          promo_months?: number
          rendered_body?: string | null
          sign_expires_at?: string | null
          sign_token?: string | null
          signature_hash?: string | null
          signed_at?: string | null
          signed_ip?: unknown
          signed_user_agent?: string | null
          signer_name?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          template_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          billing_cycle?: string
          client_id?: string
          contract_data?: Json
          created_at?: string
          created_by?: string | null
          credits_limit?: number
          end_date?: string | null
          id?: string
          jurisdiction?: string | null
          monthly_fee?: number
          notes?: string | null
          notice_days?: number
          pdf_path?: string | null
          plan_name?: string
          promo_fee?: number | null
          promo_months?: number
          rendered_body?: string | null
          sign_expires_at?: string | null
          sign_token?: string | null
          signature_hash?: string | null
          signed_at?: string | null
          signed_ip?: unknown
          signed_user_agent?: string | null
          signer_name?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          template_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "commercial_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          company_id: string | null
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          provider: string | null
          recipient_email: string
          status: string
          template_name: string
          trigger_source: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          provider?: string | null
          recipient_email: string
          status: string
          template_name: string
          trigger_source?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          provider?: string | null
          recipient_email?: string
          status?: string
          template_name?: string
          trigger_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_send_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employee_attachments: {
        Row: {
          category: string
          company_id: string
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          notes: string | null
          profile_id: string
          size_bytes: number | null
          storage_path: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          category: string
          company_id: string
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          profile_id: string
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          profile_id?: string
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_attachments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_document_alerts: {
        Row: {
          company_id: string
          doc_type: string
          expires_at: string
          id: string
          notified_at: string
          profile_id: string
          threshold_days: number
        }
        Insert: {
          company_id: string
          doc_type: string
          expires_at: string
          id?: string
          notified_at?: string
          profile_id: string
          threshold_days: number
        }
        Update: {
          company_id?: string
          doc_type?: string
          expires_at?: string
          id?: string
          notified_at?: string
          profile_id?: string
          threshold_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_document_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_document_alerts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_expenses: {
        Row: {
          amount: number
          attachment_mime: string | null
          attachment_path: string | null
          attachment_size: number | null
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          expense_date: string
          id: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          payment_status: string | null
          reason: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          attachment_mime?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          company_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          expense_date: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_status?: string | null
          reason: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          attachment_mime?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          expense_date?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_status?: string | null
          reason?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_audit: {
        Row: {
          actor_id: string | null
          company_id: string
          created_at: string
          field: string
          id: string
          new_value: Json | null
          old_value: Json | null
          reason: string
          scope: string
          scope_id: string | null
        }
        Insert: {
          actor_id?: string | null
          company_id: string
          created_at?: string
          field: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason: string
          scope: string
          scope_id?: string | null
        }
        Update: {
          actor_id?: string | null
          company_id?: string
          created_at?: string
          field?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string
          scope?: string
          scope_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_audit_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_card_users: {
        Row: {
          card_id: string
          company_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          card_id: string
          company_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          card_id?: string
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_card_users_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "fuel_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_card_vehicles: {
        Row: {
          card_id: string
          company_id: string
          created_at: string
          id: string
          vehicle_id: string
        }
        Insert: {
          card_id: string
          company_id: string
          created_at?: string
          id?: string
          vehicle_id: string
        }
        Update: {
          card_id?: string
          company_id?: string
          created_at?: string
          id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_card_vehicles_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "fuel_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_card_vehicles_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_cards: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          number: string
          photo_path: string | null
          status: Database["public"]["Enums"]["fuel_card_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          number: string
          photo_path?: string | null
          status?: Database["public"]["Enums"]["fuel_card_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          number?: string
          photo_path?: string | null
          status?: Database["public"]["Enums"]["fuel_card_status"]
          updated_at?: string
        }
        Relationships: []
      }
      fuel_records: {
        Row: {
          amount: number
          card_id: string | null
          company_id: string
          created_at: string
          driver_id: string
          id: string
          km: number
          liters: number
          note: string | null
          plate_photo_path: string | null
          price_per_liter: number | null
          pump_photo_path: string | null
          purpose: Database["public"]["Enums"]["fuel_purpose"]
          recorded_at: string
          vehicle_id: string
        }
        Insert: {
          amount: number
          card_id?: string | null
          company_id: string
          created_at?: string
          driver_id: string
          id?: string
          km: number
          liters: number
          note?: string | null
          plate_photo_path?: string | null
          price_per_liter?: number | null
          pump_photo_path?: string | null
          purpose?: Database["public"]["Enums"]["fuel_purpose"]
          recorded_at?: string
          vehicle_id: string
        }
        Update: {
          amount?: number
          card_id?: string | null
          company_id?: string
          created_at?: string
          driver_id?: string
          id?: string
          km?: number
          liters?: number
          note?: string | null
          plate_photo_path?: string | null
          price_per_liter?: number | null
          pump_photo_path?: string | null
          purpose?: Database["public"]["Enums"]["fuel_purpose"]
          recorded_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_records_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "fuel_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          last_sent_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          send_count: number
          status: Database["public"]["Enums"]["invite_status"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          send_count?: number
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          send_count?: number
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          contract_id: string
          created_at: string
          due_date: string
          id: string
          notes: string | null
          paid_at: string | null
          reference: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          contract_id: string
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          company_id: string
          created_at: string
          event: Database["public"]["Enums"]["notification_event"]
          id: string
          metadata: Json
          priority: Database["public"]["Enums"]["notification_priority"]
          read_at: string | null
          task_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          company_id: string
          created_at?: string
          event: Database["public"]["Enums"]["notification_event"]
          id?: string
          metadata?: Json
          priority?: Database["public"]["Enums"]["notification_priority"]
          read_at?: string | null
          task_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          company_id?: string
          created_at?: string
          event?: Database["public"]["Enums"]["notification_event"]
          id?: string
          metadata?: Json
          priority?: Database["public"]["Enums"]["notification_priority"]
          read_at?: string | null
          task_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payslip_email_events: {
        Row: {
          company_id: string
          created_at: string
          detail: Json
          event: string
          id: string
          payslip_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          detail?: Json
          event: string
          id?: string
          payslip_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          detail?: Json
          event?: string
          id?: string
          payslip_id?: string
        }
        Relationships: []
      }
      payslips: {
        Row: {
          company_id: string
          created_at: string
          email_delivery_status: string | null
          email_error: string | null
          email_opened_at: string | null
          email_sent_at: string | null
          email_to: string | null
          employee_name_detected: string | null
          gross_amount: number | null
          id: string
          mime_type: string
          net_amount: number | null
          original_filename: string
          parse_confidence: number | null
          parse_raw: Json
          period_month: number | null
          period_year: number | null
          size_bytes: number | null
          status: Database["public"]["Enums"]["payslip_status"]
          storage_path: string
          updated_at: string
          uploaded_by: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          email_delivery_status?: string | null
          email_error?: string | null
          email_opened_at?: string | null
          email_sent_at?: string | null
          email_to?: string | null
          employee_name_detected?: string | null
          gross_amount?: number | null
          id?: string
          mime_type?: string
          net_amount?: number | null
          original_filename: string
          parse_confidence?: number | null
          parse_raw?: Json
          period_month?: number | null
          period_year?: number | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["payslip_status"]
          storage_path: string
          updated_at?: string
          uploaded_by: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          email_delivery_status?: string | null
          email_error?: string | null
          email_opened_at?: string | null
          email_sent_at?: string | null
          email_to?: string | null
          employee_name_detected?: string | null
          gross_amount?: number | null
          id?: string
          mime_type?: string
          net_amount?: number | null
          original_filename?: string
          parse_confidence?: number | null
          parse_raw?: Json
          period_month?: number | null
          period_year?: number | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["payslip_status"]
          storage_path?: string
          updated_at?: string
          uploaded_by?: string
          user_id?: string | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string
          default_support_super_admin_id: string | null
          id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_support_super_admin_id?: string | null
          id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_support_super_admin_id?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          a1_expires_at: string | null
          a1_number: string | null
          address_be: string | null
          allowance_meal: number | null
          allowance_other: number | null
          allowance_rent: number | null
          allowance_transport: number | null
          avatar_url: string | null
          birth_date: string | null
          company_id_primary: string | null
          contract_renewal_date: string | null
          contract_type: string | null
          created_at: string
          current_company_id: string | null
          dependents_count: number | null
          driver_license_expires_at: string | null
          driver_license_number: string | null
          full_name: string | null
          health_card_expires_at: string | null
          health_card_number: string | null
          hire_date: string | null
          iban: string | null
          id: string
          initials_url: string | null
          is_active: boolean
          job_title: string | null
          main_doc_expires_at: string | null
          main_doc_number: string | null
          main_doc_type: string | null
          manual_daily_rate: number | null
          manual_fixed_rate: number | null
          manual_hour_rate: number | null
          manual_hourly_rate: number | null
          manual_mixed_base_fixed: number | null
          manual_mixed_extra_hour_rate: number | null
          manual_mixed_included_minutes: number | null
          manual_monthly_rate: number | null
          marital_status: string | null
          nationality: string | null
          occ_health_last_at: string | null
          occ_health_next_at: string | null
          official_address: string | null
          passport_expires_at: string | null
          passport_number: string | null
          pay_model: string
          pay_rate_source: string
          phone: string | null
          rate_day_be: number | null
          rate_day_foreign: number | null
          rate_hour_week: number | null
          rate_hour_weekend: number | null
          signature_url: string | null
          social_security_niss: string | null
          status: string | null
          supervisor_id: string | null
          swift: string | null
          tax_country: string | null
          tax_id_nif: string | null
          team: string | null
          team_number: number | null
          termination_date: string | null
          updated_at: string
          weekly_contracted_hours: number | null
          whatsapp: string | null
          work_location: string | null
        }
        Insert: {
          a1_expires_at?: string | null
          a1_number?: string | null
          address_be?: string | null
          allowance_meal?: number | null
          allowance_other?: number | null
          allowance_rent?: number | null
          allowance_transport?: number | null
          avatar_url?: string | null
          birth_date?: string | null
          company_id_primary?: string | null
          contract_renewal_date?: string | null
          contract_type?: string | null
          created_at?: string
          current_company_id?: string | null
          dependents_count?: number | null
          driver_license_expires_at?: string | null
          driver_license_number?: string | null
          full_name?: string | null
          health_card_expires_at?: string | null
          health_card_number?: string | null
          hire_date?: string | null
          iban?: string | null
          id: string
          initials_url?: string | null
          is_active?: boolean
          job_title?: string | null
          main_doc_expires_at?: string | null
          main_doc_number?: string | null
          main_doc_type?: string | null
          manual_daily_rate?: number | null
          manual_fixed_rate?: number | null
          manual_hour_rate?: number | null
          manual_hourly_rate?: number | null
          manual_mixed_base_fixed?: number | null
          manual_mixed_extra_hour_rate?: number | null
          manual_mixed_included_minutes?: number | null
          manual_monthly_rate?: number | null
          marital_status?: string | null
          nationality?: string | null
          occ_health_last_at?: string | null
          occ_health_next_at?: string | null
          official_address?: string | null
          passport_expires_at?: string | null
          passport_number?: string | null
          pay_model?: string
          pay_rate_source?: string
          phone?: string | null
          rate_day_be?: number | null
          rate_day_foreign?: number | null
          rate_hour_week?: number | null
          rate_hour_weekend?: number | null
          signature_url?: string | null
          social_security_niss?: string | null
          status?: string | null
          supervisor_id?: string | null
          swift?: string | null
          tax_country?: string | null
          tax_id_nif?: string | null
          team?: string | null
          team_number?: number | null
          termination_date?: string | null
          updated_at?: string
          weekly_contracted_hours?: number | null
          whatsapp?: string | null
          work_location?: string | null
        }
        Update: {
          a1_expires_at?: string | null
          a1_number?: string | null
          address_be?: string | null
          allowance_meal?: number | null
          allowance_other?: number | null
          allowance_rent?: number | null
          allowance_transport?: number | null
          avatar_url?: string | null
          birth_date?: string | null
          company_id_primary?: string | null
          contract_renewal_date?: string | null
          contract_type?: string | null
          created_at?: string
          current_company_id?: string | null
          dependents_count?: number | null
          driver_license_expires_at?: string | null
          driver_license_number?: string | null
          full_name?: string | null
          health_card_expires_at?: string | null
          health_card_number?: string | null
          hire_date?: string | null
          iban?: string | null
          id?: string
          initials_url?: string | null
          is_active?: boolean
          job_title?: string | null
          main_doc_expires_at?: string | null
          main_doc_number?: string | null
          main_doc_type?: string | null
          manual_daily_rate?: number | null
          manual_fixed_rate?: number | null
          manual_hour_rate?: number | null
          manual_hourly_rate?: number | null
          manual_mixed_base_fixed?: number | null
          manual_mixed_extra_hour_rate?: number | null
          manual_mixed_included_minutes?: number | null
          manual_monthly_rate?: number | null
          marital_status?: string | null
          nationality?: string | null
          occ_health_last_at?: string | null
          occ_health_next_at?: string | null
          official_address?: string | null
          passport_expires_at?: string | null
          passport_number?: string | null
          pay_model?: string
          pay_rate_source?: string
          phone?: string | null
          rate_day_be?: number | null
          rate_day_foreign?: number | null
          rate_hour_week?: number | null
          rate_hour_weekend?: number | null
          signature_url?: string | null
          social_security_niss?: string | null
          status?: string | null
          supervisor_id?: string | null
          swift?: string | null
          tax_country?: string | null
          tax_id_nif?: string | null
          team?: string | null
          team_number?: number | null
          termination_date?: string | null
          updated_at?: string
          weekly_contracted_hours?: number | null
          whatsapp?: string | null
          work_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_primary_fkey"
            columns: ["company_id_primary"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_current_company_id_fkey"
            columns: ["current_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_attachments: {
        Row: {
          company_id: string
          created_at: string
          file_name: string
          id: string
          mime_type: string
          sha256_hex: string | null
          size_bytes: number
          storage_path: string
          ticket_id: string
          uploaded_by: string
        }
        Insert: {
          company_id: string
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          sha256_hex?: string | null
          size_bytes: number
          storage_path: string
          ticket_id: string
          uploaded_by: string
        }
        Update: {
          company_id?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          sha256_hex?: string | null
          size_bytes?: number
          storage_path?: string
          ticket_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_events: {
        Row: {
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          company_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
          ticket_id: string
        }
        Insert: {
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          ticket_id: string
        }
        Update: {
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          author_user_id: string
          company_id: string
          created_at: string
          id: string
          is_internal: boolean
          message: string
          ticket_id: string
        }
        Insert: {
          author_user_id: string
          company_id: string
          created_at?: string
          id?: string
          is_internal?: boolean
          message: string
          ticket_id: string
        }
        Update: {
          author_user_id?: string
          company_id?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          message?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          archived_at: string | null
          assigned_user_id: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          created_by_role: string | null
          current_owner_role: string
          description: string
          destination_type: string | null
          escalated_at: string | null
          escalated_by: string | null
          escalated_to_super_admin: boolean
          escalation_reason: string | null
          first_response_at: string | null
          id: string
          internal_resolution: string | null
          module: string | null
          page_url: string | null
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          requester_user_id: string
          resolved_at: string | null
          returned_to_manager_at: string | null
          returned_to_manager_by: string | null
          route: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          support_level: string
          technical_context: Json
          technical_summary: string | null
          ticket_number: string
          title: string
          type: Database["public"]["Enums"]["support_ticket_type"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_user_id?: string | null
          closed_at?: string | null
          company_id: string
          created_at?: string
          created_by_role?: string | null
          current_owner_role?: string
          description: string
          destination_type?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          escalated_to_super_admin?: boolean
          escalation_reason?: string | null
          first_response_at?: string | null
          id?: string
          internal_resolution?: string | null
          module?: string | null
          page_url?: string | null
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          requester_user_id: string
          resolved_at?: string | null
          returned_to_manager_at?: string | null
          returned_to_manager_by?: string | null
          route?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          support_level?: string
          technical_context?: Json
          technical_summary?: string | null
          ticket_number?: string
          title: string
          type?: Database["public"]["Enums"]["support_ticket_type"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_user_id?: string | null
          closed_at?: string | null
          company_id?: string
          created_at?: string
          created_by_role?: string | null
          current_owner_role?: string
          description?: string
          destination_type?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          escalated_to_super_admin?: boolean
          escalation_reason?: string | null
          first_response_at?: string | null
          id?: string
          internal_resolution?: string | null
          module?: string | null
          page_url?: string | null
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          requester_user_id?: string
          resolved_at?: string | null
          returned_to_manager_at?: string | null
          returned_to_manager_by?: string | null
          route?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          support_level?: string
          technical_context?: Json
          technical_summary?: string | null
          ticket_number?: string
          title?: string
          type?: Database["public"]["Enums"]["support_ticket_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_escalated_by_fkey"
            columns: ["escalated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_returned_to_manager_by_fkey"
            columns: ["returned_to_manager_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      task_audit_events: {
        Row: {
          actor_role: string
          actor_user_id: string
          company_id: string
          created_at: string
          event: string
          id: string
          new_archived: boolean | null
          new_status: Database["public"]["Enums"]["task_status"] | null
          previous_archived: boolean | null
          previous_status: Database["public"]["Enums"]["task_status"] | null
          reason: string | null
          task_id: string
        }
        Insert: {
          actor_role: string
          actor_user_id: string
          company_id: string
          created_at?: string
          event: string
          id?: string
          new_archived?: boolean | null
          new_status?: Database["public"]["Enums"]["task_status"] | null
          previous_archived?: boolean | null
          previous_status?: Database["public"]["Enums"]["task_status"] | null
          reason?: string | null
          task_id: string
        }
        Update: {
          actor_role?: string
          actor_user_id?: string
          company_id?: string
          created_at?: string
          event?: string
          id?: string
          new_archived?: boolean | null
          new_status?: Database["public"]["Enums"]["task_status"] | null
          previous_archived?: boolean | null
          previous_status?: Database["public"]["Enums"]["task_status"] | null
          reason?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_audit_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_audit_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_documents: {
        Row: {
          company_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["task_document_kind"]
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          task_id: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["task_document_kind"]
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          task_id: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["task_document_kind"]
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          task_id?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_documents_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_recurrences: {
        Row: {
          absence_grace_minutes: number
          assigned_to: string | null
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          custom_cron: string | null
          description: string | null
          duration_minutes: number
          end_date: string | null
          ended_at: string | null
          ended_reason: string | null
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          id: string
          location: string | null
          monthly_rule: Json
          priority: string
          punch_mode_override: Database["public"]["Enums"]["punch_mode"] | null
          scheduled_time: string | null
          start_date: string
          status: Database["public"]["Enums"]["recurrence_status"]
          task_group_id: string | null
          title: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          absence_grace_minutes?: number
          assigned_to?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          custom_cron?: string | null
          description?: string | null
          duration_minutes?: number
          end_date?: string | null
          ended_at?: string | null
          ended_reason?: string | null
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          id?: string
          location?: string | null
          monthly_rule?: Json
          priority?: string
          punch_mode_override?: Database["public"]["Enums"]["punch_mode"] | null
          scheduled_time?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["recurrence_status"]
          task_group_id?: string | null
          title: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          absence_grace_minutes?: number
          assigned_to?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          custom_cron?: string | null
          description?: string | null
          duration_minutes?: number
          end_date?: string | null
          ended_at?: string | null
          ended_reason?: string | null
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          id?: string
          location?: string | null
          monthly_rule?: Json
          priority?: string
          punch_mode_override?: Database["public"]["Enums"]["punch_mode"] | null
          scheduled_time?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["recurrence_status"]
          task_group_id?: string | null
          title?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      task_refusals: {
        Row: {
          actor_id: string
          company_id: string
          created_at: string
          employee_id: string
          id: string
          new_status: Database["public"]["Enums"]["task_status"]
          previous_status: Database["public"]["Enums"]["task_status"]
          reason: string
          task_id: string
        }
        Insert: {
          actor_id: string
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          new_status: Database["public"]["Enums"]["task_status"]
          previous_status: Database["public"]["Enums"]["task_status"]
          reason: string
          task_id: string
        }
        Update: {
          actor_id?: string
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          new_status?: Database["public"]["Enums"]["task_status"]
          previous_status?: Database["public"]["Enums"]["task_status"]
          reason?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_refusals_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          absence_grace_minutes: number
          archived_at: string | null
          archived_by: string | null
          assigned_to: string | null
          authorized_at: string | null
          authorized_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_at: string | null
          id: string
          late_notified_at: string | null
          location: string | null
          marked_absent_at: string | null
          notes: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          punch_mode_override: Database["public"]["Enums"]["punch_mode"] | null
          recurrence_date: string | null
          recurrence_id: string | null
          refusal_reason: string | null
          refused_at: string | null
          refused_by: string | null
          scheduled_end: string | null
          scheduled_for: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_group_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          absence_grace_minutes?: number
          archived_at?: string | null
          archived_by?: string | null
          assigned_to?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          late_notified_at?: string | null
          location?: string | null
          marked_absent_at?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          punch_mode_override?: Database["public"]["Enums"]["punch_mode"] | null
          recurrence_date?: string | null
          recurrence_id?: string | null
          refusal_reason?: string | null
          refused_at?: string | null
          refused_by?: string | null
          scheduled_end?: string | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_group_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          absence_grace_minutes?: number
          archived_at?: string | null
          archived_by?: string | null
          assigned_to?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          late_notified_at?: string | null
          location?: string | null
          marked_absent_at?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          punch_mode_override?: Database["public"]["Enums"]["punch_mode"] | null
          recurrence_date?: string | null
          recurrence_id?: string | null
          refusal_reason?: string | null
          refused_at?: string | null
          refused_by?: string | null
          scheduled_end?: string | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_group_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_minutes: number | null
          end_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          end_geo_reason_text: string | null
          end_geo_status: Database["public"]["Enums"]["geo_status"] | null
          ended_at: string | null
          entry_kind: string
          geo_policy_version: number | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paid_leave_minutes: number | null
          paused_at: string | null
          resumed_at: string | null
          start_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          start_geo_reason_text: string | null
          start_geo_status: Database["public"]["Enums"]["geo_status"] | null
          started_at: string
          task_id: string | null
          updated_at: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          effective_minutes?: number | null
          end_geo_reason_code?:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          end_geo_reason_text?: string | null
          end_geo_status?: Database["public"]["Enums"]["geo_status"] | null
          ended_at?: string | null
          entry_kind?: string
          geo_policy_version?: number | null
          id?: string
          last_edit_reason?: string | null
          last_edited_at?: string | null
          last_edited_by?: string | null
          notes?: string | null
          origin?: string
          paid_leave_minutes?: number | null
          paused_at?: string | null
          resumed_at?: string | null
          start_geo_reason_code?:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          start_geo_reason_text?: string | null
          start_geo_status?: Database["public"]["Enums"]["geo_status"] | null
          started_at?: string
          task_id?: string | null
          updated_at?: string
          user_id: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          effective_minutes?: number | null
          end_geo_reason_code?:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          end_geo_reason_text?: string | null
          end_geo_status?: Database["public"]["Enums"]["geo_status"] | null
          ended_at?: string | null
          entry_kind?: string
          geo_policy_version?: number | null
          id?: string
          last_edit_reason?: string | null
          last_edited_at?: string | null
          last_edited_by?: string | null
          notes?: string | null
          origin?: string
          paid_leave_minutes?: number | null
          paused_at?: string | null
          resumed_at?: string | null
          start_geo_reason_code?:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          start_geo_reason_text?: string | null
          start_geo_status?: Database["public"]["Enums"]["geo_status"] | null
          started_at?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries_audit: {
        Row: {
          action: string
          changed_at: string
          changed_by: string
          changes: Json
          company_id: string
          id: string
          reason: string
          time_entry_id: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by: string
          changes?: Json
          company_id: string
          id?: string
          reason: string
          time_entry_id: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string
          changes?: Json
          company_id?: string
          id?: string
          reason?: string
          time_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_audit_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_audit_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry_geopoints: {
        Row: {
          accuracy_m: number | null
          captured_at: string
          client_lat: number | null
          client_lng: number | null
          client_radius_m: number | null
          company_id: string
          created_at: string
          device_fingerprint: Json | null
          distance_m: number | null
          event_kind: Database["public"]["Enums"]["punch_event_kind"]
          geo_policy_version: number
          geo_status: Database["public"]["Enums"]["geo_status"]
          id: string
          lat: number | null
          lng: number | null
          location_source: Database["public"]["Enums"]["location_source"]
          mock_location_suspected: boolean
          reason_code: Database["public"]["Enums"]["geo_reason_code"]
          reason_text: string | null
          server_at: string
          time_entry_id: string
          user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          captured_at: string
          client_lat?: number | null
          client_lng?: number | null
          client_radius_m?: number | null
          company_id: string
          created_at?: string
          device_fingerprint?: Json | null
          distance_m?: number | null
          event_kind: Database["public"]["Enums"]["punch_event_kind"]
          geo_policy_version?: number
          geo_status: Database["public"]["Enums"]["geo_status"]
          id?: string
          lat?: number | null
          lng?: number | null
          location_source?: Database["public"]["Enums"]["location_source"]
          mock_location_suspected?: boolean
          reason_code: Database["public"]["Enums"]["geo_reason_code"]
          reason_text?: string | null
          server_at?: string
          time_entry_id: string
          user_id: string
        }
        Update: {
          accuracy_m?: number | null
          captured_at?: string
          client_lat?: number | null
          client_lng?: number | null
          client_radius_m?: number | null
          company_id?: string
          created_at?: string
          device_fingerprint?: Json | null
          distance_m?: number | null
          event_kind?: Database["public"]["Enums"]["punch_event_kind"]
          geo_policy_version?: number
          geo_status?: Database["public"]["Enums"]["geo_status"]
          id?: string
          lat?: number | null
          lng?: number | null
          location_source?: Database["public"]["Enums"]["location_source"]
          mock_location_suspected?: boolean
          reason_code?: Database["public"]["Enums"]["geo_reason_code"]
          reason_text?: string | null
          server_at?: string
          time_entry_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_geopoints_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_geopoints_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_geopoints_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry_photos: {
        Row: {
          captured_at: string
          company_id: string
          created_at: string
          event_kind: Database["public"]["Enums"]["punch_event_kind"]
          id: string
          storage_path: string
          time_entry_id: string
          user_id: string
        }
        Insert: {
          captured_at: string
          company_id: string
          created_at?: string
          event_kind: Database["public"]["Enums"]["punch_event_kind"]
          id?: string
          storage_path: string
          time_entry_id: string
          user_id: string
        }
        Update: {
          captured_at?: string
          company_id?: string
          created_at?: string
          event_kind?: Database["public"]["Enums"]["punch_event_kind"]
          id?: string
          storage_path?: string
          time_entry_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_photos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_photos_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry_valuations: {
        Row: {
          amount: number
          breakdown: Json
          client_id: string | null
          company_id: string
          computed_at: string
          computed_by: string | null
          currency: string
          daily_applied: number | null
          effective_minutes: number
          fixed_applied: number
          id: string
          mixed_base_applied: number
          mixed_extra_rate_applied: number
          mixed_included_minutes_applied: number
          monthly_applied: number | null
          pay_model_used: string
          rate_applied: number
          rate_source: string
          time_entry_id: string
          user_id: string
        }
        Insert: {
          amount?: number
          breakdown?: Json
          client_id?: string | null
          company_id: string
          computed_at?: string
          computed_by?: string | null
          currency?: string
          daily_applied?: number | null
          effective_minutes?: number
          fixed_applied?: number
          id?: string
          mixed_base_applied?: number
          mixed_extra_rate_applied?: number
          mixed_included_minutes_applied?: number
          monthly_applied?: number | null
          pay_model_used: string
          rate_applied?: number
          rate_source: string
          time_entry_id: string
          user_id: string
        }
        Update: {
          amount?: number
          breakdown?: Json
          client_id?: string | null
          company_id?: string
          computed_at?: string
          computed_by?: string | null
          currency?: string
          daily_applied?: number | null
          effective_minutes?: number
          fixed_applied?: number
          id?: string
          mixed_base_applied?: number
          mixed_extra_rate_applied?: number
          mixed_included_minutes_applied?: number
          monthly_applied?: number | null
          pay_model_used?: string
          rate_applied?: number
          rate_source?: string
          time_entry_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_valuations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_valuations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_valuations_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: true
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_valuations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vacation_requests: {
        Row: {
          assigned_approver_id: string | null
          cancelled_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          end_date: string
          id: string
          note: string | null
          prior_validation: boolean
          start_date: string
          status: Database["public"]["Enums"]["vacation_status"]
          updated_at: string
          user_id: string
          validated_by: string | null
          work_location: string | null
        }
        Insert: {
          assigned_approver_id?: string | null
          cancelled_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          end_date: string
          id?: string
          note?: string | null
          prior_validation?: boolean
          start_date: string
          status?: Database["public"]["Enums"]["vacation_status"]
          updated_at?: string
          user_id: string
          validated_by?: string | null
          work_location?: string | null
        }
        Update: {
          assigned_approver_id?: string | null
          cancelled_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          end_date?: string
          id?: string
          note?: string | null
          prior_validation?: boolean
          start_date?: string
          status?: Database["public"]["Enums"]["vacation_status"]
          updated_at?: string
          user_id?: string
          validated_by?: string | null
          work_location?: string | null
        }
        Relationships: []
      }
      vehicle_assignments: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_primary: boolean
          user_id: string
          vehicle_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          user_id: string
          vehicle_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_catalog: {
        Row: {
          brand: string
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["vehicle_kind"]
          model: string | null
        }
        Insert: {
          brand: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["vehicle_kind"]
          model?: string | null
        }
        Update: {
          brand?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["vehicle_kind"]
          model?: string | null
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          brand: string | null
          company_id: string
          created_at: string
          created_by: string | null
          current_km: number
          fuel_type: Database["public"]["Enums"]["fuel_type"]
          id: string
          kind: Database["public"]["Enums"]["vehicle_kind"]
          model: string | null
          plate: string
          plate_photo_path: string | null
          status: Database["public"]["Enums"]["vehicle_status"]
          updated_at: string
          year: number | null
        }
        Insert: {
          brand?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          current_km?: number
          fuel_type?: Database["public"]["Enums"]["fuel_type"]
          id?: string
          kind?: Database["public"]["Enums"]["vehicle_kind"]
          model?: string | null
          plate: string
          plate_photo_path?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
          year?: number | null
        }
        Update: {
          brand?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          current_km?: number
          fuel_type?: Database["public"]["Enums"]["fuel_type"]
          id?: string
          kind?: Database["public"]["Enums"]["vehicle_kind"]
          model?: string | null
          plate?: string
          plate_photo_path?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      whatsapp_notifications: {
        Row: {
          attempts: number
          company_id: string | null
          created_at: string
          dedupe_key: string | null
          event: string
          http_status: number | null
          id: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          recipient_phone: string | null
          recipient_user_id: string | null
          response_body: string | null
          sent_at: string | null
          status: string
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          company_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          event: string
          http_status?: number | null
          id?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          recipient_phone?: string | null
          recipient_user_id?: string | null
          response_body?: string | null
          sent_at?: string | null
          status?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          company_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          event?: string
          http_status?: number | null
          id?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          recipient_phone?: string | null
          recipient_user_id?: string | null
          response_body?: string | null
          sent_at?: string | null
          status?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _notify: {
        Args: {
          _body: string
          _company_id: string
          _event: Database["public"]["Enums"]["notification_event"]
          _metadata?: Json
          _priority?: Database["public"]["Enums"]["notification_priority"]
          _task_id: string
          _title: string
          _user_id: string
        }
        Returns: undefined
      }
      _punch_evaluate_geo: {
        Args: {
          p_accuracy_m: number
          p_client_lat: number
          p_client_lng: number
          p_gps_status: string
          p_lat: number
          p_lng: number
          p_no_loc_policy: Database["public"]["Enums"]["geo_policy"]
          p_policy: Database["public"]["Enums"]["geo_policy"]
          p_radius: number
          p_reason_text: string
          p_required: boolean
        }
        Returns: Json
      }
      _punch_last_accepted_event: {
        Args: { p_entry_id: string }
        Returns: Database["public"]["Enums"]["punch_event_kind"]
      }
      _punch_log_geopoint: {
        Args: {
          p_accepted: boolean
          p_accuracy_m: number
          p_captured_at: string
          p_client_lat: number
          p_client_lng: number
          p_client_radius: number
          p_company_id: string
          p_device: Json
          p_entry_id: string
          p_event_kind: Database["public"]["Enums"]["punch_event_kind"]
          p_geo_status: Database["public"]["Enums"]["geo_status"]
          p_lat: number
          p_lng: number
          p_policy_version: number
          p_reason_code: Database["public"]["Enums"]["geo_reason_code"]
          p_reason_text: string
          p_user_id: string
        }
        Returns: string
      }
      _punch_resolve_policy: {
        Args: { p_client: string; p_company: string }
        Returns: Json
      }
      _punch_state: {
        Args: { p_entry: Database["public"]["Tables"]["time_entries"]["Row"] }
        Returns: string
      }
      _run_calc_tests: {
        Args: never
        Returns: {
          diff: number
          expected: number
          formula: string
          got: number
          rate_source: string
          scenario: string
          status: string
        }[]
      }
      accept_invite: { Args: { _token: string }; Returns: string }
      admin_create_company_with_invite: {
        Args: {
          _admin_email: string
          _country: string
          _currency: string
          _language: string
          _name: string
          _slug: string
          _timezone: string
        }
        Returns: {
          company_id: string
          invite_email: string
          invite_id: string
          invite_token: string
        }[]
      }
      admin_release_user_identity: { Args: { _user_id: string }; Returns: Json }
      admin_replace_manager_invite: {
        Args: { _invite_id: string; _new_email: string }
        Returns: {
          company_id: string
          email: string
          expires_at: string
          id: string
          last_sent_at: string
          role: Database["public"]["Enums"]["app_role"]
          send_count: number
          token: string
        }[]
      }
      admin_revoke_user_from_company: {
        Args: { _company_id: string; _email: string }
        Returns: {
          invites_revoked: number
          profile_cleared: boolean
          roles_removed: number
          user_id: string
        }[]
      }
      assign_support_ticket: {
        Args: { _assignee_user_id: string; _ticket_id: string }
        Returns: undefined
      }
      audit_list: {
        Args: { _contract_id: string }
        Returns: {
          actor_id: string | null
          contract_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "contract_audit_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      calculate_time_entry_value: {
        Args: { _time_entry_id: string }
        Returns: {
          amount: number
          breakdown: Json
          client_id: string | null
          company_id: string
          computed_at: string
          computed_by: string | null
          currency: string
          daily_applied: number | null
          effective_minutes: number
          fixed_applied: number
          id: string
          mixed_base_applied: number
          mixed_extra_rate_applied: number
          mixed_included_minutes_applied: number
          monthly_applied: number | null
          pay_model_used: string
          rate_applied: number
          rate_source: string
          time_entry_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "time_entry_valuations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      client_default_assignees: {
        Args: { _client_id: string }
        Returns: {
          full_name: string
          is_active: boolean
          is_primary: boolean
          user_id: string
        }[]
      }
      close_support_ticket: {
        Args: { _reason?: string; _ticket_id: string }
        Returns: {
          archived_at: string | null
          assigned_user_id: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          created_by_role: string | null
          current_owner_role: string
          description: string
          destination_type: string | null
          escalated_at: string | null
          escalated_by: string | null
          escalated_to_super_admin: boolean
          escalation_reason: string | null
          first_response_at: string | null
          id: string
          internal_resolution: string | null
          module: string | null
          page_url: string | null
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          requester_user_id: string
          resolved_at: string | null
          returned_to_manager_at: string | null
          returned_to_manager_by: string | null
          route: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          support_level: string
          technical_context: Json
          technical_summary: string | null
          ticket_number: string
          title: string
          type: Database["public"]["Enums"]["support_ticket_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "support_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      contract_sign_get: {
        Args: { _token: string }
        Returns: {
          client_name: string
          credits_limit: number
          id: string
          monthly_fee: number
          plan_name: string
          promo_fee: number
          promo_months: number
          rendered_body: string
          sign_expires_at: string
          signed_at: string
          signer_name: string
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
        }[]
      }
      contract_sign_register_view: {
        Args: { _token: string }
        Returns: undefined
      }
      contract_sign_submit: {
        Args: {
          _signature_hash: string
          _signer_name: string
          _token: string
          _user_agent: string
        }
        Returns: string
      }
      create_company_with_owner: {
        Args: { _country?: string; _name: string; _slug: string }
        Returns: string
      }
      create_or_resend_invite: {
        Args: {
          _company_id: string
          _email: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: {
          action: string
          company_id: string
          email: string
          expires_at: string
          id: string
          last_sent_at: string
          role: Database["public"]["Enums"]["app_role"]
          send_count: number
          token: string
        }[]
      }
      create_support_ticket: {
        Args: {
          _company_id: string
          _description: string
          _module: string
          _page_url: string
          _priority: Database["public"]["Enums"]["support_ticket_priority"]
          _route: string
          _technical_context: Json
          _title: string
          _type: Database["public"]["Enums"]["support_ticket_type"]
        }
        Returns: {
          id: string
          ticket_number: string
        }[]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      effective_minutes_round: {
        Args: { _pause_seconds: number; _total_seconds: number }
        Returns: number
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_ticket_whatsapp: {
        Args: { _event: string; _payload?: Json; _ticket_id: string }
        Returns: string
      }
      escalate_support_ticket: {
        Args: {
          _impact?: string
          _reason: string
          _suggested_priority?: Database["public"]["Enums"]["support_ticket_priority"]
          _technical_summary?: string
          _ticket_id: string
        }
        Returns: undefined
      }
      expense_decide: {
        Args: { _action: string; _id: string; _reason?: string }
        Returns: {
          amount: number
          attachment_mime: string | null
          attachment_path: string | null
          attachment_size: number | null
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          expense_date: string
          id: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          payment_status: string | null
          reason: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "employee_expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expense_mark_payment: {
        Args: { _id: string; _payment_status: string }
        Returns: {
          amount: number
          attachment_mime: string | null
          attachment_path: string | null
          attachment_size: number | null
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          expense_date: string
          id: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          payment_status: string | null
          reason: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "employee_expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finance_summary: {
        Args: {
          _client_id?: string
          _company_id: string
          _from: string
          _to: string
          _user_id?: string
        }
        Returns: Json
      }
      generate_support_ticket_number: { Args: never; Returns: string }
      get_auth_context: {
        Args: never
        Returns: {
          current_company_id: string
          roles: Json
        }[]
      }
      get_company_hr_settings: {
        Args: { _company_id: string }
        Returns: {
          billing_active: boolean
          company_id: string
          default_daily_rate: number
          default_fixed_rate: number
          default_hour_rate: number
          default_mixed_base_fixed: number
          default_mixed_extra_hour_rate: number
          default_mixed_included_minutes: number
          default_monthly_rate: number
          default_punch_mode: Database["public"]["Enums"]["punch_mode"]
          default_support_manager_id: string | null
          employee_approver_kind: Database["public"]["Enums"]["employee_approver_kind"]
          employee_approver_user_id: string | null
          geo_default_radius_m: number
          geo_no_location_policy_start: Database["public"]["Enums"]["geo_policy"]
          geo_no_location_policy_stop: Database["public"]["Enums"]["geo_policy"]
          geo_out_of_range_policy_start: Database["public"]["Enums"]["geo_policy"]
          geo_out_of_range_policy_stop: Database["public"]["Enums"]["geo_policy"]
          geo_photo_start_enabled: boolean
          geo_photo_stop_enabled: boolean
          geo_policy_version: number
          geo_required_start: boolean
          geo_required_stop: boolean
          manager_approver_kind: Database["public"]["Enums"]["manager_approver_kind"]
          manager_approver_user_id: string | null
          overtime_multiplier: number
          overtime_threshold_minutes: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "company_hr_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_company_punch_mode: {
        Args: { _company_id: string }
        Returns: Database["public"]["Enums"]["punch_mode"]
      }
      get_invite_preview: {
        Args: { _token: string }
        Returns: {
          company_name: string
          email: string
          expires_at: string
          status: Database["public"]["Enums"]["invite_status"]
        }[]
      }
      get_support_ticket_requester_info: {
        Args: { _ticket_id: string }
        Returns: {
          company_id: string
          company_name: string
          requester_email: string
          requester_full_name: string
          requester_user_id: string
        }[]
      }
      has_role: {
        Args: {
          _company_id?: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      haversine_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      invite_email_audit: {
        Args: { _company_id: string; _email: string }
        Returns: Json
      }
      is_company_manager: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_company_owner: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      manager_request_information: {
        Args: { _message: string; _ticket_id: string }
        Returns: undefined
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      notification_mark_read: {
        Args: { _all?: boolean; _id?: string }
        Returns: number
      }
      notifications_sweep_late: {
        Args: { _company_id?: string }
        Returns: number
      }
      notify_document_expiries: { Args: never; Returns: number }
      payslip_assign: {
        Args: { _id: string; _user_id: string }
        Returns: {
          company_id: string
          created_at: string
          email_delivery_status: string | null
          email_error: string | null
          email_opened_at: string | null
          email_sent_at: string | null
          email_to: string | null
          employee_name_detected: string | null
          gross_amount: number | null
          id: string
          mime_type: string
          net_amount: number | null
          original_filename: string
          parse_confidence: number | null
          parse_raw: Json
          period_month: number | null
          period_year: number | null
          size_bytes: number | null
          status: Database["public"]["Enums"]["payslip_status"]
          storage_path: string
          updated_at: string
          uploaded_by: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payslips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      payslip_dashboard_counts: {
        Args: { _company_id: string }
        Returns: {
          assigned: number
          failed: number
          sent: number
          total: number
          unassigned: number
        }[]
      }
      payslip_mark_sent: {
        Args: { _detail?: Json; _id: string; _status: string }
        Returns: undefined
      }
      post_support_ticket_message: {
        Args: { _is_internal: boolean; _message: string; _ticket_id: string }
        Returns: string
      }
      punch_admin_create: {
        Args: { _payload: Json; _reason: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_minutes: number | null
          end_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          end_geo_reason_text: string | null
          end_geo_status: Database["public"]["Enums"]["geo_status"] | null
          ended_at: string | null
          entry_kind: string
          geo_policy_version: number | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paid_leave_minutes: number | null
          paused_at: string | null
          resumed_at: string | null
          start_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          start_geo_reason_text: string | null
          start_geo_status: Database["public"]["Enums"]["geo_status"] | null
          started_at: string
          task_id: string | null
          updated_at: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      punch_admin_update: {
        Args: { _id: string; _payload: Json; _reason: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_minutes: number | null
          end_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          end_geo_reason_text: string | null
          end_geo_status: Database["public"]["Enums"]["geo_status"] | null
          ended_at: string | null
          entry_kind: string
          geo_policy_version: number | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paid_leave_minutes: number | null
          paused_at: string | null
          resumed_at: string | null
          start_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          start_geo_reason_text: string | null
          start_geo_status: Database["public"]["Enums"]["geo_status"] | null
          started_at: string
          task_id: string | null
          updated_at: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      punch_admin_void_for_redo: {
        Args: { _id: string; _reason: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_minutes: number | null
          end_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          end_geo_reason_text: string | null
          end_geo_status: Database["public"]["Enums"]["geo_status"] | null
          ended_at: string | null
          entry_kind: string
          geo_policy_version: number | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paid_leave_minutes: number | null
          paused_at: string | null
          resumed_at: string | null
          start_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          start_geo_reason_text: string | null
          start_geo_status: Database["public"]["Enums"]["geo_status"] | null
          started_at: string
          task_id: string | null
          updated_at: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      punch_arrival_v2: { Args: { p_input: Json }; Returns: Json }
      punch_audit_list: {
        Args: { _time_entry_id: string }
        Returns: {
          action: string
          changed_at: string
          changed_by: string
          changes: Json
          company_id: string
          id: string
          reason: string
          time_entry_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "time_entries_audit"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      punch_departure_v2: { Args: { p_input: Json }; Returns: Json }
      punch_employee_manual_end: {
        Args: {
          _complete_task?: boolean
          _ended_at: string
          _reason?: string
          _time_entry_id: string
        }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_minutes: number | null
          end_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          end_geo_reason_text: string | null
          end_geo_status: Database["public"]["Enums"]["geo_status"] | null
          ended_at: string | null
          entry_kind: string
          geo_policy_version: number | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paid_leave_minutes: number | null
          paused_at: string | null
          resumed_at: string | null
          start_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          start_geo_reason_text: string | null
          start_geo_status: Database["public"]["Enums"]["geo_status"] | null
          started_at: string
          task_id: string | null
          updated_at: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      punch_employee_manual_start: {
        Args: { _started_at: string; _task_id: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_minutes: number | null
          end_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          end_geo_reason_text: string | null
          end_geo_status: Database["public"]["Enums"]["geo_status"] | null
          ended_at: string | null
          entry_kind: string
          geo_policy_version: number | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paid_leave_minutes: number | null
          paused_at: string | null
          resumed_at: string | null
          start_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          start_geo_reason_text: string | null
          start_geo_status: Database["public"]["Enums"]["geo_status"] | null
          started_at: string
          task_id: string | null
          updated_at: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      punch_employee_regularize: {
        Args: {
          _ended_at?: string
          _reason?: string
          _started_at: string
          _task_id: string
        }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_minutes: number | null
          end_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          end_geo_reason_text: string | null
          end_geo_status: Database["public"]["Enums"]["geo_status"] | null
          ended_at: string | null
          entry_kind: string
          geo_policy_version: number | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paid_leave_minutes: number | null
          paused_at: string | null
          resumed_at: string | null
          start_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          start_geo_reason_text: string | null
          start_geo_status: Database["public"]["Enums"]["geo_status"] | null
          started_at: string
          task_id: string | null
          updated_at: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      punch_manual_end: {
        Args: { _task_id: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_minutes: number | null
          end_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          end_geo_reason_text: string | null
          end_geo_status: Database["public"]["Enums"]["geo_status"] | null
          ended_at: string | null
          entry_kind: string
          geo_policy_version: number | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paid_leave_minutes: number | null
          paused_at: string | null
          resumed_at: string | null
          start_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          start_geo_reason_text: string | null
          start_geo_status: Database["public"]["Enums"]["geo_status"] | null
          started_at: string
          task_id: string | null
          updated_at: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      punch_manual_start: {
        Args: { _task_id: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_minutes: number | null
          end_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          end_geo_reason_text: string | null
          end_geo_status: Database["public"]["Enums"]["geo_status"] | null
          ended_at: string | null
          entry_kind: string
          geo_policy_version: number | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paid_leave_minutes: number | null
          paused_at: string | null
          resumed_at: string | null
          start_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          start_geo_reason_text: string | null
          start_geo_status: Database["public"]["Enums"]["geo_status"] | null
          started_at: string
          task_id: string | null
          updated_at: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      punch_open_entries_list: { Args: { _company_id?: string }; Returns: Json }
      punch_open_entry_request_help: {
        Args: {
          _attempted_task_id?: string
          _correlation_id?: string
          _time_entry_id: string
        }
        Returns: Json
      }
      punch_open_entry_self: { Args: never; Returns: Json }
      punch_paid_leave_create: {
        Args: { _payload: Json; _reason: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_minutes: number | null
          end_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          end_geo_reason_text: string | null
          end_geo_status: Database["public"]["Enums"]["geo_status"] | null
          ended_at: string | null
          entry_kind: string
          geo_policy_version: number | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paid_leave_minutes: number | null
          paused_at: string | null
          resumed_at: string | null
          start_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          start_geo_reason_text: string | null
          start_geo_status: Database["public"]["Enums"]["geo_status"] | null
          started_at: string
          task_id: string | null
          updated_at: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      punch_pause: {
        Args: { _note?: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_minutes: number | null
          end_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          end_geo_reason_text: string | null
          end_geo_status: Database["public"]["Enums"]["geo_status"] | null
          ended_at: string | null
          entry_kind: string
          geo_policy_version: number | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paid_leave_minutes: number | null
          paused_at: string | null
          resumed_at: string | null
          start_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          start_geo_reason_text: string | null
          start_geo_status: Database["public"]["Enums"]["geo_status"] | null
          started_at: string
          task_id: string | null
          updated_at: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      punch_pause_v2: { Args: { p_input: Json }; Returns: Json }
      punch_recover_open_entry: {
        Args: {
          _complete_task?: boolean
          _ended_at: string
          _reason_code: string
          _reason_text?: string
          _time_entry_id: string
        }
        Returns: Json
      }
      punch_resume: {
        Args: never
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_minutes: number | null
          end_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          end_geo_reason_text: string | null
          end_geo_status: Database["public"]["Enums"]["geo_status"] | null
          ended_at: string | null
          entry_kind: string
          geo_policy_version: number | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paid_leave_minutes: number | null
          paused_at: string | null
          resumed_at: string | null
          start_geo_reason_code:
            | Database["public"]["Enums"]["geo_reason_code"]
            | null
          start_geo_reason_text: string | null
          start_geo_status: Database["public"]["Enums"]["geo_status"] | null
          started_at: string
          task_id: string | null
          updated_at: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      punch_resume_v2: { Args: { p_input: Json }; Returns: Json }
      punch_start_v2: { Args: { p_input: Json }; Returns: Json }
      punch_stop_v2: { Args: { p_input: Json }; Returns: Json }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalculate_period: {
        Args: {
          _company_id: string
          _from: string
          _reason: string
          _to: string
        }
        Returns: number
      }
      recurrence_end: {
        Args: { _cancel_future?: boolean; _id: string; _reason: string }
        Returns: {
          absence_grace_minutes: number
          assigned_to: string | null
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          custom_cron: string | null
          description: string | null
          duration_minutes: number
          end_date: string | null
          ended_at: string | null
          ended_reason: string | null
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          id: string
          location: string | null
          monthly_rule: Json
          priority: string
          punch_mode_override: Database["public"]["Enums"]["punch_mode"] | null
          scheduled_time: string | null
          start_date: string
          status: Database["public"]["Enums"]["recurrence_status"]
          task_group_id: string | null
          title: string
          updated_at: string
          weekdays: number[]
        }
        SetofOptions: {
          from: "*"
          to: "task_recurrences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      recurrence_materialize: {
        Args: { _company_id?: string; _days_ahead?: number }
        Returns: number
      }
      recurrence_reassign: {
        Args: { _new_user: string; _scope?: string; _task_id: string }
        Returns: number
      }
      recurrence_update: {
        Args: {
          _from_task?: string
          _id: string
          _payload: Json
          _scope?: string
        }
        Returns: number
      }
      recurrence_update_occurrence: {
        Args: { _payload: Json; _task_id: string }
        Returns: {
          absence_grace_minutes: number
          archived_at: string | null
          archived_by: string | null
          assigned_to: string | null
          authorized_at: string | null
          authorized_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_at: string | null
          id: string
          late_notified_at: string | null
          location: string | null
          marked_absent_at: string | null
          notes: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          punch_mode_override: Database["public"]["Enums"]["punch_mode"] | null
          recurrence_date: string | null
          recurrence_id: string | null
          refusal_reason: string | null
          refused_at: string | null
          refused_by: string | null
          scheduled_end: string | null
          scheduled_for: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_group_id: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_support_attachment: {
        Args: {
          _file_name: string
          _mime_type: string
          _sha256_hex: string
          _size_bytes: number
          _storage_path: string
          _ticket_id: string
        }
        Returns: string
      }
      remove_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: undefined
      }
      reopen_support_ticket: {
        Args: { _reason: string; _ticket_id: string }
        Returns: undefined
      }
      reopen_support_ticket_with_message: {
        Args: {
          _assigned_user_id?: string
          _destination_type: string
          _message: string
          _technical_context?: Json
          _ticket_id: string
        }
        Returns: string
      }
      resend_invite: {
        Args: { _invite_id: string }
        Returns: {
          company_id: string
          email: string
          expires_at: string
          id: string
          last_sent_at: string
          role: Database["public"]["Enums"]["app_role"]
          send_count: number
          token: string
          was_expired: boolean
          was_revoked: boolean
        }[]
      }
      resolve_billing_rule: { Args: { _time_entry_id: string }; Returns: Json }
      resolve_effective_compensation: {
        Args: {
          _client_id?: string
          _company_id?: string
          _employee_id: string
        }
        Returns: Json
      }
      resolve_support_ticket_by_manager: {
        Args: { _resolution: string; _ticket_id: string }
        Returns: undefined
      }
      resolve_ticket_whatsapp_recipient: {
        Args: { _ticket_id: string }
        Returns: {
          phone: string
          reason: string
          user_id: string
        }[]
      }
      resolve_vacation_approver: {
        Args: { _company_id: string; _user_id: string }
        Returns: string
      }
      return_support_ticket_to_manager: {
        Args: { _reason: string; _ticket_id: string }
        Returns: undefined
      }
      set_current_company: { Args: { _company_id: string }; Returns: string }
      set_member_role: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      support_notify_managers: {
        Args: {
          _body: string
          _company_id: string
          _event: Database["public"]["Enums"]["notification_event"]
          _priority?: Database["public"]["Enums"]["notification_priority"]
          _ticket_id: string
          _title: string
        }
        Returns: number
      }
      support_notify_super_admins: {
        Args: {
          _body: string
          _company_id: string
          _event: Database["public"]["Enums"]["notification_event"]
          _priority?: Database["public"]["Enums"]["notification_priority"]
          _ticket_id: string
          _title: string
        }
        Returns: number
      }
      support_notify_user: {
        Args: {
          _body: string
          _company_id: string
          _event: Database["public"]["Enums"]["notification_event"]
          _priority?: Database["public"]["Enums"]["notification_priority"]
          _ticket_id: string
          _title: string
          _user_id: string
        }
        Returns: string
      }
      support_ticket_log_event: {
        Args: {
          _after: Json
          _before: Json
          _company_id: string
          _event_type: string
          _metadata?: Json
          _ticket_id: string
        }
        Returns: string
      }
      task_absence_allowed_at: {
        Args: {
          _due_at: string
          _recurrence_date: string
          _scheduled_for: string
        }
        Returns: string
      }
      task_archive: {
        Args: { _archive?: boolean; _task_id: string }
        Returns: {
          absence_grace_minutes: number
          archived_at: string | null
          archived_by: string | null
          assigned_to: string | null
          authorized_at: string | null
          authorized_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_at: string | null
          id: string
          late_notified_at: string | null
          location: string | null
          marked_absent_at: string | null
          notes: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          punch_mode_override: Database["public"]["Enums"]["punch_mode"] | null
          recurrence_date: string | null
          recurrence_id: string | null
          refusal_reason: string | null
          refused_at: string | null
          refused_by: string | null
          scheduled_end: string | null
          scheduled_for: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_group_id: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      task_cancel: {
        Args: { _reason: string; _task_id: string }
        Returns: {
          absence_grace_minutes: number
          archived_at: string | null
          archived_by: string | null
          assigned_to: string | null
          authorized_at: string | null
          authorized_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_at: string | null
          id: string
          late_notified_at: string | null
          location: string | null
          marked_absent_at: string | null
          notes: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          punch_mode_override: Database["public"]["Enums"]["punch_mode"] | null
          recurrence_date: string | null
          recurrence_id: string | null
          refusal_reason: string | null
          refused_at: string | null
          refused_by: string | null
          scheduled_end: string | null
          scheduled_for: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_group_id: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      task_effective_punch_mode: {
        Args: { _task_id: string }
        Returns: Database["public"]["Enums"]["punch_mode"]
      }
      task_group_progress: { Args: { _task_id: string }; Returns: Json }
      task_reassign_from_refusal: {
        Args: { _new_user: string; _task_id: string }
        Returns: {
          absence_grace_minutes: number
          archived_at: string | null
          archived_by: string | null
          assigned_to: string | null
          authorized_at: string | null
          authorized_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_at: string | null
          id: string
          late_notified_at: string | null
          location: string | null
          marked_absent_at: string | null
          notes: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          punch_mode_override: Database["public"]["Enums"]["punch_mode"] | null
          recurrence_date: string | null
          recurrence_id: string | null
          refusal_reason: string | null
          refused_at: string | null
          refused_by: string | null
          scheduled_end: string | null
          scheduled_for: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_group_id: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      task_request_authorization: {
        Args: { _note?: string; _task_id: string }
        Returns: {
          absence_grace_minutes: number
          archived_at: string | null
          archived_by: string | null
          assigned_to: string | null
          authorized_at: string | null
          authorized_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_at: string | null
          id: string
          late_notified_at: string | null
          location: string | null
          marked_absent_at: string | null
          notes: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          punch_mode_override: Database["public"]["Enums"]["punch_mode"] | null
          recurrence_date: string | null
          recurrence_id: string | null
          refusal_reason: string | null
          refused_at: string | null
          refused_by: string | null
          scheduled_end: string | null
          scheduled_for: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_group_id: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      task_soft_delete: {
        Args: { _task_id: string }
        Returns: {
          absence_grace_minutes: number
          archived_at: string | null
          archived_by: string | null
          assigned_to: string | null
          authorized_at: string | null
          authorized_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_at: string | null
          id: string
          late_notified_at: string | null
          location: string | null
          marked_absent_at: string | null
          notes: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          punch_mode_override: Database["public"]["Enums"]["punch_mode"] | null
          recurrence_date: string | null
          recurrence_id: string | null
          refusal_reason: string | null
          refused_at: string | null
          refused_by: string | null
          scheduled_end: string | null
          scheduled_for: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_group_id: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      task_timing_is_manual: { Args: { _client_id: string }; Returns: boolean }
      task_transition: {
        Args: { _action: string; _reason?: string; _task_id: string }
        Returns: {
          absence_grace_minutes: number
          archived_at: string | null
          archived_by: string | null
          assigned_to: string | null
          authorized_at: string | null
          authorized_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_at: string | null
          id: string
          late_notified_at: string | null
          location: string | null
          marked_absent_at: string | null
          notes: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          punch_mode_override: Database["public"]["Enums"]["punch_mode"] | null
          recurrence_date: string | null
          recurrence_id: string | null
          refusal_reason: string | null
          refused_at: string | null
          refused_by: string | null
          scheduled_end: string | null
          scheduled_for: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_group_id: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tasks_sweep_absent: { Args: { _company_id?: string }; Returns: number }
      tasks_timing_modes: {
        Args: { _task_ids: string[] }
        Returns: {
          task_id: string
          timing_mode: string
        }[]
      }
      update_client_billing: {
        Args: { _client_id: string; _patch: Json; _reason: string }
        Returns: {
          address: string | null
          billing_mode: string
          company_id: string
          created_at: string
          created_by: string | null
          daily_rate: number | null
          email: string | null
          fixed_rate: number | null
          geo_address: string | null
          geo_lat: number | null
          geo_lng: number | null
          geo_radius_m: number | null
          hourly_rate: number | null
          id: string
          mixed_base_fixed: number | null
          mixed_extra_hour_rate: number | null
          mixed_included_minutes: number | null
          monthly_rate: number | null
          name: string
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["client_status"]
          timing_mode: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "clients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_company_finance_settings: {
        Args: { _company_id: string; _patch: Json; _reason: string }
        Returns: {
          billing_active: boolean
          company_id: string
          default_daily_rate: number
          default_fixed_rate: number
          default_hour_rate: number
          default_mixed_base_fixed: number
          default_mixed_extra_hour_rate: number
          default_mixed_included_minutes: number
          default_monthly_rate: number
          default_punch_mode: Database["public"]["Enums"]["punch_mode"]
          default_support_manager_id: string | null
          employee_approver_kind: Database["public"]["Enums"]["employee_approver_kind"]
          employee_approver_user_id: string | null
          geo_default_radius_m: number
          geo_no_location_policy_start: Database["public"]["Enums"]["geo_policy"]
          geo_no_location_policy_stop: Database["public"]["Enums"]["geo_policy"]
          geo_out_of_range_policy_start: Database["public"]["Enums"]["geo_policy"]
          geo_out_of_range_policy_stop: Database["public"]["Enums"]["geo_policy"]
          geo_photo_start_enabled: boolean
          geo_photo_stop_enabled: boolean
          geo_policy_version: number
          geo_required_start: boolean
          geo_required_stop: boolean
          manager_approver_kind: Database["public"]["Enums"]["manager_approver_kind"]
          manager_approver_user_id: string | null
          overtime_multiplier: number
          overtime_threshold_minutes: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "company_hr_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_employee_pay: {
        Args: {
          _company_id: string
          _patch: Json
          _reason: string
          _user_id: string
        }
        Returns: {
          a1_expires_at: string | null
          a1_number: string | null
          address_be: string | null
          allowance_meal: number | null
          allowance_other: number | null
          allowance_rent: number | null
          allowance_transport: number | null
          avatar_url: string | null
          birth_date: string | null
          company_id_primary: string | null
          contract_renewal_date: string | null
          contract_type: string | null
          created_at: string
          current_company_id: string | null
          dependents_count: number | null
          driver_license_expires_at: string | null
          driver_license_number: string | null
          full_name: string | null
          health_card_expires_at: string | null
          health_card_number: string | null
          hire_date: string | null
          iban: string | null
          id: string
          initials_url: string | null
          is_active: boolean
          job_title: string | null
          main_doc_expires_at: string | null
          main_doc_number: string | null
          main_doc_type: string | null
          manual_daily_rate: number | null
          manual_fixed_rate: number | null
          manual_hour_rate: number | null
          manual_hourly_rate: number | null
          manual_mixed_base_fixed: number | null
          manual_mixed_extra_hour_rate: number | null
          manual_mixed_included_minutes: number | null
          manual_monthly_rate: number | null
          marital_status: string | null
          nationality: string | null
          occ_health_last_at: string | null
          occ_health_next_at: string | null
          official_address: string | null
          passport_expires_at: string | null
          passport_number: string | null
          pay_model: string
          pay_rate_source: string
          phone: string | null
          rate_day_be: number | null
          rate_day_foreign: number | null
          rate_hour_week: number | null
          rate_hour_weekend: number | null
          signature_url: string | null
          social_security_niss: string | null
          status: string | null
          supervisor_id: string | null
          swift: string | null
          tax_country: string | null
          tax_id_nif: string | null
          team: string | null
          team_number: number | null
          termination_date: string | null
          updated_at: string
          weekly_contracted_hours: number | null
          whatsapp: string | null
          work_location: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_support_ticket_priority: {
        Args: {
          _new_priority: Database["public"]["Enums"]["support_ticket_priority"]
          _ticket_id: string
        }
        Returns: undefined
      }
      update_support_ticket_status: {
        Args: {
          _new_status: Database["public"]["Enums"]["support_ticket_status"]
          _reason?: string
          _ticket_id: string
        }
        Returns: undefined
      }
      vacation_confirm: {
        Args: { _action: string; _id: string; _reason?: string }
        Returns: {
          assigned_approver_id: string | null
          cancelled_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          end_date: string
          id: string
          note: string | null
          prior_validation: boolean
          start_date: string
          status: Database["public"]["Enums"]["vacation_status"]
          updated_at: string
          user_id: string
          validated_by: string | null
          work_location: string | null
        }
        SetofOptions: {
          from: "*"
          to: "vacation_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      vacation_decide: {
        Args: { _action: string; _id: string; _reason?: string }
        Returns: {
          assigned_approver_id: string | null
          cancelled_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          end_date: string
          id: string
          note: string | null
          prior_validation: boolean
          start_date: string
          status: Database["public"]["Enums"]["vacation_status"]
          updated_at: string
          user_id: string
          validated_by: string | null
          work_location: string | null
        }
        SetofOptions: {
          from: "*"
          to: "vacation_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      vacation_notify_payload: { Args: { _vacation_id: string }; Returns: Json }
      whatsapp_claim_batch: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          company_id: string | null
          created_at: string
          dedupe_key: string | null
          event: string
          http_status: number | null
          id: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          recipient_phone: string | null
          recipient_user_id: string | null
          response_body: string | null
          sent_at: string | null
          status: string
          ticket_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "whatsapp_notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      whatsapp_mark_failed: {
        Args: {
          _error: string
          _http_status?: number
          _id: string
          _response?: string
        }
        Returns: undefined
      }
      whatsapp_mark_sent: {
        Args: { _http_status?: number; _id: string; _response?: string }
        Returns: undefined
      }
      whatsapp_requeue: { Args: { _id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "super_admin" | "manager" | "employee" | "owner"
      client_status: "ativo" | "inativo"
      commercial_client_status: "lead" | "negotiation" | "active" | "inactive"
      company_status: "pending" | "active" | "suspended"
      contract_service:
        | "whatsapp"
        | "instagram"
        | "website"
        | "dashboard"
        | "ai_support"
        | "reports"
        | "scheduling"
      contract_status:
        | "draft"
        | "sent"
        | "signed"
        | "implementation"
        | "promo_period"
        | "active"
        | "suspended"
        | "cancelled"
      employee_approver_kind:
        | "manager"
        | "supervisor"
        | "owner"
        | "specific_user"
      fuel_card_status: "ativo" | "inativo"
      fuel_purpose: "profissional" | "pessoal"
      fuel_type:
        | "gasolina"
        | "diesel"
        | "etanol"
        | "flex"
        | "gnv"
        | "eletrico"
        | "hibrido"
      geo_policy: "alert" | "justify" | "block"
      geo_reason_code:
        | "WITHIN_RADIUS"
        | "OUT_OF_RADIUS"
        | "NO_GPS"
        | "GPS_TIMEOUT"
        | "GPS_DENIED"
        | "CLIENT_WITHOUT_LOCATION"
        | "LOW_ACCURACY"
        | "MANUAL_OVERRIDE"
        | "ADMIN_OVERRIDE"
      geo_status: "within" | "out_of_range" | "no_location"
      invite_status: "pending" | "accepted" | "revoked" | "expired"
      invoice_status: "pending" | "paid" | "overdue" | "cancelled"
      location_source: "gps" | "wifi" | "beacon" | "qr_code" | "nfc" | "manual"
      manager_approver_kind:
        | "owner"
        | "other_manager"
        | "specific_user"
        | "self_allowed"
      notification_event:
        | "task_created"
        | "task_assigned"
        | "task_authorization_requested"
        | "task_authorized"
        | "task_rejected"
        | "task_started"
        | "task_completed"
        | "task_cancelled"
        | "task_marked_absent"
        | "task_late"
        | "vacation_requested"
        | "vacation_approved"
        | "vacation_rejected"
        | "vacation_cancelled"
        | "vacation_confirmation_required"
        | "vacation_confirmed"
        | "vacation_declined"
        | "vacation_created_by_manager"
        | "vacation_change_requested"
        | "expense_created"
        | "expense_approved"
        | "expense_rejected"
        | "ticket_created"
        | "ticket_updated"
        | "ticket_message_added"
        | "ticket_status_changed"
        | "ticket_resolved"
        | "ticket_reopened"
        | "punch_open_help_requested"
        | "punch_regularized"
      notification_priority: "baixa" | "media" | "alta" | "urgente"
      payslip_status: "unassigned" | "assigned" | "sent" | "failed" | "archived"
      punch_event_kind:
        | "arrival"
        | "start"
        | "pause"
        | "resume"
        | "stop"
        | "departure"
      punch_mode: "automatico" | "manual" | "ambos"
      recurrence_frequency: "daily" | "weekly" | "monthly" | "custom"
      recurrence_status: "active" | "paused" | "ended"
      support_ticket_priority: "baixa" | "normal" | "alta" | "urgente"
      support_ticket_status:
        | "aberto"
        | "em_analise"
        | "aguardando_cliente"
        | "em_desenvolvimento"
        | "em_validacao"
        | "resolvido"
        | "rejeitado"
        | "fechado"
        | "under_manager_review"
        | "waiting_employee"
        | "resolved_by_manager"
        | "escalated"
        | "under_technical_review"
        | "waiting_manager"
        | "returned_to_manager"
      support_ticket_type:
        | "erro"
        | "alteracao"
        | "inclusao"
        | "duvida"
        | "acesso"
        | "financeiro"
        | "rh"
        | "tarefas"
        | "ponto"
        | "ferias"
        | "despesas"
        | "recibos"
        | "clientes"
        | "geolocalizacao"
        | "outro"
      task_document_kind: "pdf" | "image" | "checklist" | "video"
      task_priority: "baixa" | "media" | "alta" | "urgente"
      task_status:
        | "pendente"
        | "em_andamento"
        | "concluido"
        | "cancelado"
        | "ausente"
        | "autorizado"
      vacation_status:
        | "pendente"
        | "aprovado"
        | "rejeitado"
        | "cancelado"
        | "pendente_confirmacao"
      vehicle_kind:
        | "carro"
        | "moto"
        | "van"
        | "caminhao"
        | "utilitario"
        | "outro"
        | "furgao"
        | "particular"
      vehicle_status: "ativo" | "inativo" | "manutencao"
      workflow_step:
        | "operational_assessment"
        | "platform_configuration"
        | "ai_configuration"
        | "integrations"
        | "testing"
        | "training"
        | "go_live"
      workflow_step_status: "pending" | "in_progress" | "done" | "blocked"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "manager", "employee", "owner"],
      client_status: ["ativo", "inativo"],
      commercial_client_status: ["lead", "negotiation", "active", "inactive"],
      company_status: ["pending", "active", "suspended"],
      contract_service: [
        "whatsapp",
        "instagram",
        "website",
        "dashboard",
        "ai_support",
        "reports",
        "scheduling",
      ],
      contract_status: [
        "draft",
        "sent",
        "signed",
        "implementation",
        "promo_period",
        "active",
        "suspended",
        "cancelled",
      ],
      employee_approver_kind: [
        "manager",
        "supervisor",
        "owner",
        "specific_user",
      ],
      fuel_card_status: ["ativo", "inativo"],
      fuel_purpose: ["profissional", "pessoal"],
      fuel_type: [
        "gasolina",
        "diesel",
        "etanol",
        "flex",
        "gnv",
        "eletrico",
        "hibrido",
      ],
      geo_policy: ["alert", "justify", "block"],
      geo_reason_code: [
        "WITHIN_RADIUS",
        "OUT_OF_RADIUS",
        "NO_GPS",
        "GPS_TIMEOUT",
        "GPS_DENIED",
        "CLIENT_WITHOUT_LOCATION",
        "LOW_ACCURACY",
        "MANUAL_OVERRIDE",
        "ADMIN_OVERRIDE",
      ],
      geo_status: ["within", "out_of_range", "no_location"],
      invite_status: ["pending", "accepted", "revoked", "expired"],
      invoice_status: ["pending", "paid", "overdue", "cancelled"],
      location_source: ["gps", "wifi", "beacon", "qr_code", "nfc", "manual"],
      manager_approver_kind: [
        "owner",
        "other_manager",
        "specific_user",
        "self_allowed",
      ],
      notification_event: [
        "task_created",
        "task_assigned",
        "task_authorization_requested",
        "task_authorized",
        "task_rejected",
        "task_started",
        "task_completed",
        "task_cancelled",
        "task_marked_absent",
        "task_late",
        "vacation_requested",
        "vacation_approved",
        "vacation_rejected",
        "vacation_cancelled",
        "vacation_confirmation_required",
        "vacation_confirmed",
        "vacation_declined",
        "vacation_created_by_manager",
        "vacation_change_requested",
        "expense_created",
        "expense_approved",
        "expense_rejected",
        "ticket_created",
        "ticket_updated",
        "ticket_message_added",
        "ticket_status_changed",
        "ticket_resolved",
        "ticket_reopened",
        "punch_open_help_requested",
        "punch_regularized",
      ],
      notification_priority: ["baixa", "media", "alta", "urgente"],
      payslip_status: ["unassigned", "assigned", "sent", "failed", "archived"],
      punch_event_kind: [
        "arrival",
        "start",
        "pause",
        "resume",
        "stop",
        "departure",
      ],
      punch_mode: ["automatico", "manual", "ambos"],
      recurrence_frequency: ["daily", "weekly", "monthly", "custom"],
      recurrence_status: ["active", "paused", "ended"],
      support_ticket_priority: ["baixa", "normal", "alta", "urgente"],
      support_ticket_status: [
        "aberto",
        "em_analise",
        "aguardando_cliente",
        "em_desenvolvimento",
        "em_validacao",
        "resolvido",
        "rejeitado",
        "fechado",
        "under_manager_review",
        "waiting_employee",
        "resolved_by_manager",
        "escalated",
        "under_technical_review",
        "waiting_manager",
        "returned_to_manager",
      ],
      support_ticket_type: [
        "erro",
        "alteracao",
        "inclusao",
        "duvida",
        "acesso",
        "financeiro",
        "rh",
        "tarefas",
        "ponto",
        "ferias",
        "despesas",
        "recibos",
        "clientes",
        "geolocalizacao",
        "outro",
      ],
      task_document_kind: ["pdf", "image", "checklist", "video"],
      task_priority: ["baixa", "media", "alta", "urgente"],
      task_status: [
        "pendente",
        "em_andamento",
        "concluido",
        "cancelado",
        "ausente",
        "autorizado",
      ],
      vacation_status: [
        "pendente",
        "aprovado",
        "rejeitado",
        "cancelado",
        "pendente_confirmacao",
      ],
      vehicle_kind: [
        "carro",
        "moto",
        "van",
        "caminhao",
        "utilitario",
        "outro",
        "furgao",
        "particular",
      ],
      vehicle_status: ["ativo", "inativo", "manutencao"],
      workflow_step: [
        "operational_assessment",
        "platform_configuration",
        "ai_configuration",
        "integrations",
        "testing",
        "training",
        "go_live",
      ],
      workflow_step_status: ["pending", "in_progress", "done", "blocked"],
    },
  },
} as const
