
export type Language = 'RU' | 'UZ' | 'EN';

export interface MultiLangString {
  RU: string;
  UZ: string;
  EN: string;
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  totalPoints: number;
  pointsEarned: number;
  pointsRedeemed: number;
  status: 'active' | 'blocked';
  lastUpdated: string;
}

export interface Gift {
  id: string;
  name: MultiLangString;
  description: MultiLangString;
  pointsCost: number;
  category: string;
  stock: number;
  isActive: boolean;
  image: string;
}

export interface Product {
  id: string;
  name: MultiLangString;
  pointsValue: number;
  category?: string;
  isActive: boolean;
  qrCode?: string;
}

export type RequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Shipped' | 'Completed';

export interface RedemptionRequest {
  id: string;
  date: string;
  customerId: string;
  customerName: string;
  giftId: string;
  giftName: string;
  giftImage?: string;
  pointsUsed: number;
  status: RequestStatus;
  operator?: string;
  rejectReason?: string;
  requestType: 'Customer' | 'Admin';
}

export interface Activity {
  id: string;
  type: 'customer_added' | 'gift_redeemed' | 'request_status_change' | 'order_confirmed' | 'system_change';
  description: string;
  time: string;
  user: string;
}

export type OrderStatus = 'Draft' | 'Confirmed' | 'Cancelled' | 'Reversed';

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  pointsPerUnit: number;
  quantity: number;
  totalPoints: number;
}

export interface Order {
  id: string;
  date: string;
  customerId: string;
  customerName: string;
  totalPoints: number;
  itemsCount: number;
  createdBy: string;
  status: OrderStatus;
  items: OrderItem[];
  note?: string;
}

export interface ReconciliationRow {
  id: string;
  date: string;
  documentName: string;
  documentId: string;
  type: 'Order' | 'Accrual' | 'Gift' | 'Adjustment';
  earned: number; // DT
  spent: number;  // KT
  balanceAfter: number;
}

export interface QrScanEvent {
  id: number;
  date: string;
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  qrCode: string;
  quantity: number;
  pointsAwarded: number;
}

export interface ProductQrCode {
  id: number;
  qrCode: string;
  productId: string;
  productName: string;
  pointsPerUnit: number;
  isUsed: boolean;
  usedByClientId: string;
  usedAt: string;
  isRevoked: boolean;
  revokedAt: string;
  createdAt: string;
}
