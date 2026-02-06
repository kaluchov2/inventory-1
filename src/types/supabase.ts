// Supabase Database Types
// V2 Architecture - includes drops and staff tables

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          role: 'admin' | 'user' | 'viewer';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          role?: 'admin' | 'user' | 'viewer';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          role?: 'admin' | 'user' | 'viewer';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // V2: Drops table
      drops: {
        Row: {
          id: string;
          drop_number: string;
          arrival_date: string;
          status: 'active' | 'completed' | 'archived';
          total_products: number;
          total_units: number;
          total_value: number;
          sold_count: number;
          available_count: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          is_deleted: boolean;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          drop_number: string;
          arrival_date: string;
          status?: 'active' | 'completed' | 'archived';
          total_products?: number;
          total_units?: number;
          total_value?: number;
          sold_count?: number;
          available_count?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          drop_number?: string;
          arrival_date?: string;
          status?: 'active' | 'completed' | 'archived';
          total_products?: number;
          total_units?: number;
          total_value?: number;
          sold_count?: number;
          available_count?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
        };
        Relationships: [];
      };

      // V2: Staff table
      staff: {
        Row: {
          id: string;
          name: string;
          is_active: boolean;
          total_sales: number;
          total_amount: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          is_deleted: boolean;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          name: string;
          is_active?: boolean;
          total_sales?: number;
          total_amount?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          is_active?: boolean;
          total_sales?: number;
          total_amount?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
        };
        Relationships: [];
      };

      // V2: Products table with new columns
      products: {
        Row: {
          id: string;
          name: string;
          sku: string;
          // V2 UPS fields
          ups_raw: string | null;
          identifier_type: 'legacy' | 'numbered' | null;
          drop_number: string | null;
          product_number: number | null;
          drop_sequence: number | null;
          // Legacy field
          ups_batch: number;
          quantity: number;
          unit_price: number;
          original_price: number | null;
          category: string;
          brand: string | null;
          color: string | null;
          size: string | null;
          description: string | null;
          notes: string | null;
          // Per-status quantity columns
          available_qty: number;
          sold_qty: number;
          donated_qty: number;
          lost_qty: number;
          expired_qty: number;
          // V2: 8 status values
          status: 'available' | 'sold' | 'reserved' | 'promotional' | 'donated' | 'review' | 'expired' | 'lost';
          // V2: Tracking
          sold_by: string | null;
          sold_to: string | null;
          sold_at: string | null;
          low_stock_threshold: number;
          barcode: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          is_deleted: boolean;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          name: string;
          sku: string;
          ups_raw?: string | null;
          identifier_type?: 'legacy' | 'numbered' | null;
          drop_number?: string | null;
          product_number?: number | null;
          drop_sequence?: number | null;
          ups_batch: number;
          quantity?: number;
          unit_price?: number;
          original_price?: number | null;
          category: string;
          brand?: string | null;
          color?: string | null;
          size?: string | null;
          description?: string | null;
          notes?: string | null;
          available_qty?: number;
          sold_qty?: number;
          donated_qty?: number;
          lost_qty?: number;
          expired_qty?: number;
          status?: 'available' | 'sold' | 'reserved' | 'promotional' | 'donated' | 'review' | 'expired' | 'lost';
          sold_by?: string | null;
          sold_to?: string | null;
          sold_at?: string | null;
          low_stock_threshold?: number;
          barcode?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          sku?: string;
          ups_raw?: string | null;
          identifier_type?: 'legacy' | 'numbered' | null;
          drop_number?: string | null;
          product_number?: number | null;
          drop_sequence?: number | null;
          ups_batch?: number;
          quantity?: number;
          unit_price?: number;
          original_price?: number | null;
          category?: string;
          brand?: string | null;
          color?: string | null;
          size?: string | null;
          description?: string | null;
          notes?: string | null;
          available_qty?: number;
          sold_qty?: number;
          donated_qty?: number;
          lost_qty?: number;
          expired_qty?: number;
          status?: 'available' | 'sold' | 'reserved' | 'promotional' | 'donated' | 'review' | 'expired' | 'lost';
          sold_by?: string | null;
          sold_to?: string | null;
          sold_at?: string | null;
          low_stock_threshold?: number;
          barcode?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'products_sold_by_fkey';
            columns: ['sold_by'];
            referencedRelation: 'staff';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'products_sold_to_fkey';
            columns: ['sold_to'];
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          }
        ];
      };

      customers: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          balance: number;
          total_purchases: number;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          is_deleted: boolean;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          balance?: number;
          total_purchases?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string | null;
          email?: string | null;
          balance?: number;
          total_purchases?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
        };
        Relationships: [];
      };

      transactions: {
        Row: {
          id: string;
          customer_id: string | null;
          customer_name: string;
          subtotal: number;
          discount: number;
          discount_note: string | null;
          total: number;
          payment_method: 'cash' | 'transfer' | 'card' | 'mixed' | 'credit';
          cash_amount: number;
          transfer_amount: number;
          card_amount: number;
          actual_card_amount: number | null;
          is_installment: boolean;
          installment_amount: number | null;
          remaining_balance: number | null;
          // V2: Staff tracking
          sold_by: string | null;
          ups_batch: number | null;
          notes: string | null;
          date: string;
          payment_date: string | null;
          type: 'sale' | 'return' | 'adjustment' | 'installment_payment';
          created_at: string;
          created_by: string | null;
          is_deleted: boolean;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          customer_id?: string | null;
          customer_name: string;
          subtotal: number;
          discount?: number;
          discount_note?: string | null;
          total: number;
          payment_method: 'cash' | 'transfer' | 'card' | 'mixed' | 'credit';
          cash_amount?: number;
          transfer_amount?: number;
          card_amount?: number;
          actual_card_amount?: number | null;
          is_installment?: boolean;
          installment_amount?: number | null;
          remaining_balance?: number | null;
          sold_by?: string | null;
          ups_batch?: number | null;
          notes?: string | null;
          date: string;
          payment_date?: string | null;
          type: 'sale' | 'return' | 'adjustment' | 'installment_payment';
          created_at?: string;
          created_by?: string | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          customer_id?: string | null;
          customer_name?: string;
          subtotal?: number;
          discount?: number;
          discount_note?: string | null;
          total?: number;
          payment_method?: 'cash' | 'transfer' | 'card' | 'mixed' | 'credit';
          cash_amount?: number;
          transfer_amount?: number;
          card_amount?: number;
          actual_card_amount?: number | null;
          is_installment?: boolean;
          installment_amount?: number | null;
          remaining_balance?: number | null;
          sold_by?: string | null;
          ups_batch?: number | null;
          notes?: string | null;
          date?: string;
          payment_date?: string | null;
          type?: 'sale' | 'return' | 'adjustment' | 'installment_payment';
          created_at?: string;
          created_by?: string | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'transactions_sold_by_fkey';
            columns: ['sold_by'];
            referencedRelation: 'staff';
            referencedColumns: ['id'];
          }
        ];
      };

      transaction_items: {
        Row: {
          id: string;
          transaction_id: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
          unit_price: number;
          total_price: number;
          category: string | null;
          brand: string | null;
          color: string | null;
          size: string | null;
        };
        Insert: {
          id?: string;
          transaction_id: string;
          product_id?: string | null;
          product_name: string;
          quantity: number;
          unit_price: number;
          total_price: number;
          category?: string | null;
          brand?: string | null;
          color?: string | null;
          size?: string | null;
        };
        Update: {
          id?: string;
          transaction_id?: string;
          product_id?: string | null;
          product_name?: string;
          quantity?: number;
          unit_price?: number;
          total_price?: number;
          category?: string | null;
          brand?: string | null;
          color?: string | null;
          size?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
