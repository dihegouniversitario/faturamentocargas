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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      itineraries: {
        Row: {
          created_at: string
          dest_center: string
          id: string
          itinerary: string
          unit_id: string
        }
        Insert: {
          created_at?: string
          dest_center: string
          id?: string
          itinerary?: string
          unit_id: string
        }
        Update: {
          created_at?: string
          dest_center?: string
          id?: string
          itinerary?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itineraries_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      load_history: {
        Row: {
          action: string
          created_at: string
          details: string
          id: string
          load_id: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: string
          id?: string
          load_id: string
          user_id?: string | null
          user_name?: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: string
          id?: string
          load_id?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "load_history_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      load_items: {
        Row: {
          boxes: number
          boxes_per_pallet: number
          description: string
          id: string
          load_id: string
          pallet_id: string
          pallets: number
          position: number
          sap_code: string
        }
        Insert: {
          boxes?: number
          boxes_per_pallet?: number
          description?: string
          id?: string
          load_id: string
          pallet_id?: string
          pallets?: number
          position?: number
          sap_code?: string
        }
        Update: {
          boxes?: number
          boxes_per_pallet?: number
          description?: string
          id?: string
          load_id?: string
          pallet_id?: string
          pallets?: number
          position?: number
          sap_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "load_items_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      loads: {
        Row: {
          carrier: string
          created_at: string
          created_by: string
          dest_center: string
          dest_name: string
          dt: string
          id: string
          import_date: string
          itinerary: string
          load_date: string
          load_number: string
          locked_at: string | null
          locked_by: string | null
          locked_by_name: string | null
          notes: string
          origin_center: string
          pallet_order: string
          plate: string
          product_order: string
          raw_text: string
          status: Database["public"]["Enums"]["load_status"]
          unit_id: string
          updated_at: string
        }
        Insert: {
          carrier?: string
          created_at?: string
          created_by?: string
          dest_center?: string
          dest_name?: string
          dt: string
          id?: string
          import_date?: string
          itinerary?: string
          load_date: string
          load_number?: string
          locked_at?: string | null
          locked_by?: string | null
          locked_by_name?: string | null
          notes?: string
          origin_center?: string
          pallet_order?: string
          plate?: string
          product_order?: string
          raw_text?: string
          status?: Database["public"]["Enums"]["load_status"]
          unit_id: string
          updated_at?: string
        }
        Update: {
          carrier?: string
          created_at?: string
          created_by?: string
          dest_center?: string
          dest_name?: string
          dt?: string
          id?: string
          import_date?: string
          itinerary?: string
          load_date?: string
          load_number?: string
          locked_at?: string | null
          locked_by?: string | null
          locked_by_name?: string | null
          notes?: string
          origin_center?: string
          pallet_order?: string
          plate?: string
          product_order?: string
          raw_text?: string
          status?: Database["public"]["Enums"]["load_status"]
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loads_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string
          id: string
          unit_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id: string
          unit_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          billing_email: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          billing_email?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          billing_email?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_unit: { Args: never; Returns: string }
      current_user_name: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "remessa" | "faturamento"
      load_status:
        | "pendente"
        | "em_faturamento"
        | "faturada"
        | "erro"
        | "saida"
        | "faturando"
        | "em_corte"
        | "impressa_ag_cte"
        | "finalizada"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "remessa", "faturamento"],
      load_status: [
        "pendente",
        "em_faturamento",
        "faturada",
        "erro",
        "saida",
        "faturando",
        "em_corte",
        "impressa_ag_cte",
        "finalizada",
      ],
    },
  },
} as const
