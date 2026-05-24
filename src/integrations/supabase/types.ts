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
          email: string | null
          fixed_rate: number | null
          hourly_rate: number | null
          id: string
          mixed_base_fixed: number | null
          mixed_extra_hour_rate: number | null
          mixed_included_minutes: number | null
          name: string
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          billing_mode?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          fixed_rate?: number | null
          hourly_rate?: number | null
          id?: string
          mixed_base_fixed?: number | null
          mixed_extra_hour_rate?: number | null
          mixed_included_minutes?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          billing_mode?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          fixed_rate?: number | null
          hourly_rate?: number | null
          id?: string
          mixed_base_fixed?: number | null
          mixed_extra_hour_rate?: number | null
          mixed_included_minutes?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
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
          country: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          language: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["company_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          language?: string
          name: string
          slug: string
          status?: Database["public"]["Enums"]["company_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          language?: string
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["company_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_hr_settings: {
        Row: {
          billing_active: boolean
          company_id: string
          default_fixed_rate: number
          default_hour_rate: number
          default_mixed_base_fixed: number
          default_mixed_extra_hour_rate: number
          default_mixed_included_minutes: number
          default_punch_mode: Database["public"]["Enums"]["punch_mode"]
          employee_approver_kind: Database["public"]["Enums"]["employee_approver_kind"]
          employee_approver_user_id: string | null
          manager_approver_kind: Database["public"]["Enums"]["manager_approver_kind"]
          manager_approver_user_id: string | null
          overtime_multiplier: number
          overtime_threshold_minutes: number
          updated_at: string
        }
        Insert: {
          billing_active?: boolean
          company_id: string
          default_fixed_rate?: number
          default_hour_rate?: number
          default_mixed_base_fixed?: number
          default_mixed_extra_hour_rate?: number
          default_mixed_included_minutes?: number
          default_punch_mode?: Database["public"]["Enums"]["punch_mode"]
          employee_approver_kind?: Database["public"]["Enums"]["employee_approver_kind"]
          employee_approver_user_id?: string | null
          manager_approver_kind?: Database["public"]["Enums"]["manager_approver_kind"]
          manager_approver_user_id?: string | null
          overtime_multiplier?: number
          overtime_threshold_minutes?: number
          updated_at?: string
        }
        Update: {
          billing_active?: boolean
          company_id?: string
          default_fixed_rate?: number
          default_hour_rate?: number
          default_mixed_base_fixed?: number
          default_mixed_extra_hour_rate?: number
          default_mixed_included_minutes?: number
          default_punch_mode?: Database["public"]["Enums"]["punch_mode"]
          employee_approver_kind?: Database["public"]["Enums"]["employee_approver_kind"]
          employee_approver_user_id?: string | null
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
          role: Database["public"]["Enums"]["app_role"]
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
          role?: Database["public"]["Enums"]["app_role"]
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
          role?: Database["public"]["Enums"]["app_role"]
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_company_id: string | null
          full_name: string | null
          id: string
          is_active: boolean
          job_title: string | null
          manual_fixed_rate: number | null
          manual_hour_rate: number | null
          manual_mixed_base_fixed: number | null
          manual_mixed_extra_hour_rate: number | null
          manual_mixed_included_minutes: number | null
          pay_model: string
          pay_rate_source: string
          phone: string | null
          supervisor_id: string | null
          team: string | null
          updated_at: string
          work_location: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_company_id?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          job_title?: string | null
          manual_fixed_rate?: number | null
          manual_hour_rate?: number | null
          manual_mixed_base_fixed?: number | null
          manual_mixed_extra_hour_rate?: number | null
          manual_mixed_included_minutes?: number | null
          pay_model?: string
          pay_rate_source?: string
          phone?: string | null
          supervisor_id?: string | null
          team?: string | null
          updated_at?: string
          work_location?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_company_id?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          job_title?: string | null
          manual_fixed_rate?: number | null
          manual_hour_rate?: number | null
          manual_mixed_base_fixed?: number | null
          manual_mixed_extra_hour_rate?: number | null
          manual_mixed_included_minutes?: number | null
          pay_model?: string
          pay_rate_source?: string
          phone?: string | null
          supervisor_id?: string | null
          team?: string | null
          updated_at?: string
          work_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_company_id_fkey"
            columns: ["current_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          scheduled_time: string
          start_date: string
          status: Database["public"]["Enums"]["recurrence_status"]
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
          scheduled_time?: string
          start_date: string
          status?: Database["public"]["Enums"]["recurrence_status"]
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
          scheduled_time?: string
          start_date?: string
          status?: Database["public"]["Enums"]["recurrence_status"]
          title?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      tasks: {
        Row: {
          absence_grace_minutes: number
          assigned_to: string | null
          authorized_at: string | null
          authorized_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
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
          scheduled_end: string | null
          scheduled_for: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          absence_grace_minutes?: number
          assigned_to?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
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
          scheduled_end?: string | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          absence_grace_minutes?: number
          assigned_to?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
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
          scheduled_end?: string | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
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
          ended_at: string | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paused_at: string | null
          resumed_at: string | null
          started_at: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          effective_minutes?: number | null
          ended_at?: string | null
          id?: string
          last_edit_reason?: string | null
          last_edited_at?: string | null
          last_edited_by?: string | null
          notes?: string | null
          origin?: string
          paused_at?: string | null
          resumed_at?: string | null
          started_at?: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          effective_minutes?: number | null
          ended_at?: string | null
          id?: string
          last_edit_reason?: string | null
          last_edited_at?: string | null
          last_edited_by?: string | null
          notes?: string | null
          origin?: string
          paused_at?: string | null
          resumed_at?: string | null
          started_at?: string
          task_id?: string
          updated_at?: string
          user_id?: string
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
      time_entry_valuations: {
        Row: {
          amount: number
          breakdown: Json
          client_id: string | null
          company_id: string
          computed_at: string
          computed_by: string | null
          currency: string
          effective_minutes: number
          fixed_applied: number
          id: string
          mixed_base_applied: number
          mixed_extra_rate_applied: number
          mixed_included_minutes_applied: number
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
          effective_minutes?: number
          fixed_applied?: number
          id?: string
          mixed_base_applied?: number
          mixed_extra_rate_applied?: number
          mixed_included_minutes_applied?: number
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
          effective_minutes?: number
          fixed_applied?: number
          id?: string
          mixed_base_applied?: number
          mixed_extra_rate_applied?: number
          mixed_included_minutes_applied?: number
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
          invite_token: string
        }[]
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
          effective_minutes: number
          fixed_applied: number
          id: string
          mixed_base_applied: number
          mixed_extra_rate_applied: number
          mixed_included_minutes_applied: number
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
      effective_minutes_round: {
        Args: { _pause_seconds: number; _total_seconds: number }
        Returns: number
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
      get_auth_context: {
        Args: never
        Returns: {
          current_company_id: string
          roles: Json
        }[]
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
      has_role: {
        Args: {
          _company_id?: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      notification_mark_read: {
        Args: { _all?: boolean; _id?: string }
        Returns: number
      }
      notifications_sweep_late: {
        Args: { _company_id?: string }
        Returns: number
      }
      punch_admin_create: {
        Args: { _payload: Json; _reason: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_minutes: number | null
          ended_at: string | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paused_at: string | null
          resumed_at: string | null
          started_at: string
          task_id: string
          updated_at: string
          user_id: string
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
          ended_at: string | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paused_at: string | null
          resumed_at: string | null
          started_at: string
          task_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      punch_manual_end: {
        Args: { _task_id: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_minutes: number | null
          ended_at: string | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paused_at: string | null
          resumed_at: string | null
          started_at: string
          task_id: string
          updated_at: string
          user_id: string
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
          ended_at: string | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paused_at: string | null
          resumed_at: string | null
          started_at: string
          task_id: string
          updated_at: string
          user_id: string
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
          ended_at: string | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paused_at: string | null
          resumed_at: string | null
          started_at: string
          task_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      punch_resume: {
        Args: never
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_minutes: number | null
          ended_at: string | null
          id: string
          last_edit_reason: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          notes: string | null
          origin: string
          paused_at: string | null
          resumed_at: string | null
          started_at: string
          task_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
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
          scheduled_time: string
          start_date: string
          status: Database["public"]["Enums"]["recurrence_status"]
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
          assigned_to: string | null
          authorized_at: string | null
          authorized_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
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
          scheduled_end: string | null
          scheduled_for: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
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
      remove_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: undefined
      }
      resolve_billing_rule: { Args: { _time_entry_id: string }; Returns: Json }
      resolve_vacation_approver: {
        Args: { _company_id: string; _user_id: string }
        Returns: string
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
      task_effective_punch_mode: {
        Args: { _task_id: string }
        Returns: Database["public"]["Enums"]["punch_mode"]
      }
      task_request_authorization: {
        Args: { _note?: string; _task_id: string }
        Returns: {
          absence_grace_minutes: number
          assigned_to: string | null
          authorized_at: string | null
          authorized_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
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
          scheduled_end: string | null
          scheduled_for: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
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
      task_transition: {
        Args: { _action: string; _task_id: string }
        Returns: {
          absence_grace_minutes: number
          assigned_to: string | null
          authorized_at: string | null
          authorized_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
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
          scheduled_end: string | null
          scheduled_for: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
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
      update_client_billing: {
        Args: { _client_id: string; _patch: Json; _reason: string }
        Returns: {
          address: string | null
          billing_mode: string
          company_id: string
          created_at: string
          created_by: string | null
          email: string | null
          fixed_rate: number | null
          hourly_rate: number | null
          id: string
          mixed_base_fixed: number | null
          mixed_extra_hour_rate: number | null
          mixed_included_minutes: number | null
          name: string
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["client_status"]
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
          default_fixed_rate: number
          default_hour_rate: number
          default_mixed_base_fixed: number
          default_mixed_extra_hour_rate: number
          default_mixed_included_minutes: number
          default_punch_mode: Database["public"]["Enums"]["punch_mode"]
          employee_approver_kind: Database["public"]["Enums"]["employee_approver_kind"]
          employee_approver_user_id: string | null
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
          avatar_url: string | null
          created_at: string
          current_company_id: string | null
          full_name: string | null
          id: string
          is_active: boolean
          job_title: string | null
          manual_fixed_rate: number | null
          manual_hour_rate: number | null
          manual_mixed_base_fixed: number | null
          manual_mixed_extra_hour_rate: number | null
          manual_mixed_included_minutes: number | null
          pay_model: string
          pay_rate_source: string
          phone: string | null
          supervisor_id: string | null
          team: string | null
          updated_at: string
          work_location: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
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
      invite_status: "pending" | "accepted" | "revoked" | "expired"
      invoice_status: "pending" | "paid" | "overdue" | "cancelled"
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
      notification_priority: "baixa" | "media" | "alta" | "urgente"
      punch_mode: "automatico" | "manual" | "ambos"
      recurrence_frequency: "daily" | "weekly" | "monthly" | "custom"
      recurrence_status: "active" | "paused" | "ended"
      task_document_kind: "pdf" | "image" | "checklist" | "video"
      task_priority: "baixa" | "media" | "alta" | "urgente"
      task_status:
        | "pendente"
        | "em_andamento"
        | "concluido"
        | "cancelado"
        | "ausente"
        | "autorizado"
      vacation_status: "pendente" | "aprovado" | "rejeitado" | "cancelado"
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
      invite_status: ["pending", "accepted", "revoked", "expired"],
      invoice_status: ["pending", "paid", "overdue", "cancelled"],
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
      ],
      notification_priority: ["baixa", "media", "alta", "urgente"],
      punch_mode: ["automatico", "manual", "ambos"],
      recurrence_frequency: ["daily", "weekly", "monthly", "custom"],
      recurrence_status: ["active", "paused", "ended"],
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
      vacation_status: ["pendente", "aprovado", "rejeitado", "cancelado"],
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
