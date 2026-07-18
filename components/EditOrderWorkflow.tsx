
import React, { useState, useMemo } from 'react';
import { 
  ChevronLeft, 
  Search, 
  User, 
  CheckCircle2, 
  ArrowRight, 
  Trash2, 
  Plus, 
  Info,
  Package,
  AlertTriangle,
  X,
  History
} from 'lucide-react';
import { DUMMY_CUSTOMERS, DUMMY_PRODUCTS, TRANSLATIONS } from '../constants';
import { Customer, Product, Language, OrderItem, Order } from '../types';

interface EditOrderWorkflowProps {
  lang: Language;
  onCancel: () => void;
  order: Order;
  onSave: (updatedOrder: Order) => void;
}

const EditOrderWorkflow: React.FC<EditOrderWorkflowProps> = ({ lang, onCancel, order, onSave }) => {
  const t = TRANSLATIONS[lang];
  const isConfirmed = order.status === 'Confirmed';
  
  // Initialize state from existing order
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    DUMMY_CUSTOMERS.find(c => c.id === order.customerId) || null
  );
  const [customerSearch, setCustomerSearch] = useState('');
  const [items, setItems] = useState<OrderItem[]>(order.items);
  const [adminNote, setAdminNote] = useState(order.note || '');
  const [changeReason, setChangeReason] = useState('');
  const [step, setStep] = useState(2); // Start at products step for editing
  const [isFinalConfirmationChecked, setIsFinalConfirmationChecked] = useState(false);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    return DUMMY_CUSTOMERS.filter(c => 
      c.fullName.toLowerCase().includes(customerSearch.toLowerCase()) || 
      c.id.toLowerCase().includes(customerSearch.toLowerCase())
    );
  }, [customerSearch]);

  const totalOrderPoints = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.totalPoints || 0), 0);
  }, [items]);

  const delta = totalOrderPoints - order.totalPoints;

  const addRow = () => {
    setItems([...items, { id: Date.now().toString(), productId: '', productName: '', pointsPerUnit: 0, quantity: 1, totalPoints: 0 }]);
  };

  const removeRow = (id: string) => {
    if (items.length === 1) return;
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, productId: string) => {
    const product = DUMMY_PRODUCTS.find(p => p.id === productId);
    if (!product) return;

    setItems(items.map(item => {
      if (item.id === id) {
        const qty = item.quantity || 1;
        return {
          ...item,
          productId: product.id,
          productName: product.name[lang],
          pointsPerUnit: product.pointsValue,
          totalPoints: product.pointsValue * qty
        };
      }
      return item;
    }));
  };

  const updateQuantity = (id: string, qty: number) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const points = item.pointsPerUnit || 0;
        return {
          ...item,
          quantity: qty,
          totalPoints: points * qty
        };
      }
      return item;
    }));
  };

  const handleConfirm = () => {
    const updatedOrder: Order = {
      ...order,
      customerId: selectedCustomer?.id || order.customerId,
      customerName: selectedCustomer?.fullName || order.customerName,
      items: items,
      itemsCount: items.length,
      totalPoints: totalOrderPoints,
      note: adminNote,
    };
    onSave(updatedOrder);
  };

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Workflow Header */}
      <div className="flex items-center gap-6 mb-8 px-8 pt-8">
        <button 
          onClick={onCancel}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t.edit_order}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-bold uppercase tracking-widest ${step >= 1 ? 'text-cyan-600' : 'text-slate-300'}`}>{t.customer}</span>
            <ArrowRight className="w-3 h-3 text-slate-300" />
            <span className={`text-xs font-bold uppercase tracking-widest ${step >= 2 ? 'text-cyan-600' : 'text-slate-300'}`}>{t.step_products}</span>
            <ArrowRight className="w-3 h-3 text-slate-300" />
            <span className={`text-xs font-bold uppercase tracking-widest ${step >= 3 ? 'text-cyan-600' : 'text-slate-300'}`}>{t.review}</span>
          </div>
        </div>
        <div className="ml-auto">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
            isConfirmed 
              ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
              : 'bg-slate-50 text-slate-400 border-slate-100'
          }`}>
            {isConfirmed ? t.confirmed : t.draft}
          </span>
        </div>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full px-8">
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-cyan-500"></div>
              <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <User className="w-5 h-5 text-cyan-500" /> {t.step_customer}
              </h3>
              
              {/* Customer selection is disabled for confirmed orders to maintain strictness as per requirements */}
              {isConfirmed ? (
                <div className="p-8 rounded-[32px] bg-slate-100 text-slate-500 shadow-inner relative overflow-hidden">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">{t.customer}</p>
                      <h4 className="text-3xl font-black">{selectedCustomer?.fullName}</h4>
                      <p className="text-slate-400 font-medium">{selectedCustomer?.id} • {selectedCustomer?.phone}</p>
                    </div>
                    <div className="p-3 bg-slate-200 rounded-2xl">
                      <AlertTriangle className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Customer cannot be changed for confirmed orders</p>
                </div>
              ) : (
                <>
                  <div className="relative mb-8">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input 
                      type="text"
                      placeholder={t.search_placeholder}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-lg outline-none focus:ring-2 focus:ring-cyan-500/10 focus:bg-white transition-all shadow-inner"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                    />
                  </div>

                  {selectedCustomer ? (
                    <div className="p-8 rounded-[32px] bg-gradient-to-br from-cyan-600 to-azure-700 text-white shadow-lg relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                        <User className="w-32 h-32" />
                      </div>
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <p className="text-cyan-100 text-[10px] font-bold uppercase tracking-widest mb-1">{t.active_selection}</p>
                          <h4 className="text-3xl font-black">{selectedCustomer.fullName}</h4>
                          <p className="text-cyan-100/80 font-medium">{selectedCustomer.id} • {selectedCustomer.phone}</p>
                        </div>
                        <button 
                          onClick={() => setSelectedCustomer(null)}
                          className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-all"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map(c => (
                          <button 
                            key={c.id}
                            onClick={() => setSelectedCustomer(c)}
                            className="w-full p-5 flex items-center justify-between rounded-2xl hover:bg-cyan-50 border border-transparent hover:border-cyan-100 transition-all text-left group"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-white flex items-center justify-center font-bold text-slate-500">
                                {c.fullName.charAt(0)}
                              </div>
                              <div>
                                <p className="font-bold text-slate-800">{c.fullName}</p>
                                <p className="text-xs text-slate-400">{c.id} • {c.phone}</p>
                              </div>
                            </div>
                            <Plus className="w-5 h-5 text-slate-300 group-hover:text-cyan-500 transition-all" />
                          </button>
                        ))
                      ) : (
                        <div className="p-12 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-3xl">
                           <p className="font-medium">{t.type_to_search}</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div className="flex justify-end pt-4">
               <button 
                 disabled={!selectedCustomer}
                 onClick={() => setStep(2)}
                 className="flex items-center gap-2 px-10 py-4 bg-cyan-600 text-white font-bold rounded-2xl shadow-xl shadow-cyan-600/20 disabled:opacity-50 hover:bg-cyan-700 transition-all group"
               >
                 {t.next}: {t.step_products} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
               </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-xl overflow-hidden relative flex flex-col min-h-[500px]">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-cyan-500"></div>
              <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Package className="w-5 h-5 text-cyan-500" /> {t.step_products}
                </h3>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400 font-bold uppercase">{t.issuing_to}:</span>
                  <div className="px-4 py-2 bg-white border border-slate-200 rounded-xl flex items-center gap-2">
                    <User className="w-3 h-3 text-cyan-500" />
                    <span className="text-sm font-bold text-slate-700">{selectedCustomer?.fullName}</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-x-auto p-8">
                <table className="w-full text-left">
                  <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <tr>
                      <th className="pb-4 w-[45%]">{t.product}</th>
                      <th className="pb-4 px-4 text-center">{t.unit_points}</th>
                      <th className="pb-4 px-4 text-center">{t.quantity}</th>
                      <th className="pb-4 px-4 text-right">{t.row_total}</th>
                      <th className="pb-4 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {items.map((item) => (
                      <tr key={item.id} className="group transition-all">
                        <td className="py-6 pr-4">
                          <select 
                            className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-cyan-500/10 focus:bg-white transition-all font-medium"
                            value={item.productId || ''}
                            onChange={(e) => updateItem(item.id!, e.target.value)}
                          >
                            <option value="">{t.select_product}...</option>
                            {DUMMY_PRODUCTS.map(p => (
                              <option key={p.id} value={p.id}>{p.name[lang]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-6 px-4 text-center">
                          <span className="text-sm font-bold text-slate-400">{item.pointsPerUnit || '—'}</span>
                        </td>
                        <td className="py-6 px-4 text-center">
                          <input 
                            type="number"
                            min="1"
                            className="w-20 p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm text-center font-bold outline-none focus:ring-2 focus:ring-cyan-500/10 focus:bg-white transition-all"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.id!, parseInt(e.target.value) || 0)}
                          />
                        </td>
                        <td className="py-6 px-4 text-right">
                          <span className="text-base font-black text-cyan-600">
                            {item.totalPoints ? `+${item.totalPoints}` : '0'}
                          </span>
                        </td>
                        <td className="py-6 text-right">
                          <button 
                            onClick={() => removeRow(item.id!)}
                            className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button 
                  onClick={addRow}
                  className="mt-6 flex items-center gap-2 px-6 py-3 bg-slate-50 text-slate-500 font-bold text-sm rounded-2xl hover:bg-cyan-50 hover:text-cyan-600 transition-all border border-transparent hover:border-cyan-100"
                >
                  <Plus className="w-4 h-4" /> {t.add_next_product}
                </button>
              </div>

              {/* Order Footer */}
              <div className="bg-slate-900 p-8 flex items-center justify-between text-white">
                <div className="flex gap-10">
                   <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.items_count}</p>
                      <p className="text-2xl font-black">{items.filter(i => i.productId).length}</p>
                   </div>
                   <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.grand_total}</p>
                      <p className="text-2xl font-black text-cyan-400">+{totalOrderPoints.toLocaleString()} pts</p>
                   </div>
                   {isConfirmed && (
                     <>
                        <div className="h-full w-px bg-white/10 mx-2"></div>
                        <div>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.difference}</p>
                           <p className={`text-2xl font-black ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                             {delta >= 0 ? `+${delta}` : delta}
                           </p>
                        </div>
                     </>
                   )}
                </div>
                <div className="flex gap-4">
                  {!isConfirmed && <button onClick={() => setStep(1)} className="px-6 py-4 bg-white/10 hover:bg-white/20 font-bold rounded-2xl transition-all">{t.back}</button>}
                  <button 
                    disabled={totalOrderPoints <= 0}
                    onClick={() => setStep(3)}
                    className="px-10 py-4 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-2xl shadow-xl shadow-cyan-500/30 transition-all flex items-center gap-2"
                  >
                    {t.next}: {t.review_confirm} <CheckCircle2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
             <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500"></div>
              <h3 className="text-xl font-bold text-slate-800 mb-8 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" /> {t.step_review}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="space-y-6">
                  <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{t.customer_details}</h4>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center font-bold text-slate-500 border border-slate-100 shadow-sm">
                        {selectedCustomer?.fullName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{selectedCustomer?.fullName}</p>
                        <p className="text-xs text-slate-400">{selectedCustomer?.id}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 text-emerald-600">{t.account_update_summary}</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                         <span className="text-sm font-medium text-slate-500">{t.old_total}:</span>
                         <span className="text-sm font-bold text-slate-800">{order.totalPoints.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                         <span className="text-sm font-medium text-slate-500">{t.new_total}:</span>
                         <span className="text-sm font-black text-cyan-600">{totalOrderPoints.toLocaleString()}</span>
                      </div>
                      <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                         <span className="text-sm font-bold text-slate-800">{t.difference}:</span>
                         <span className={`text-xl font-black ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {delta >= 0 ? `+${delta}` : delta}
                         </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col">
                  <div className="flex-1 p-6 rounded-3xl bg-slate-50 border border-slate-100 flex flex-col">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{t.product_breakdown}</h4>
                    <div className="flex-1 space-y-3 overflow-y-auto max-h-[200px] custom-scrollbar pr-2">
                       {items.filter(i => i.productId).map(item => (
                         <div key={item.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                            <div className="flex flex-col">
                               <span className="text-sm font-bold text-slate-700">{item.productName}</span>
                               <span className="text-[10px] text-slate-400 uppercase">{t.quantity}: {item.quantity} • {item.pointsPerUnit} pts/ea</span>
                            </div>
                            <span className="text-sm font-black text-cyan-600">+{item.totalPoints}</span>
                         </div>
                       ))}
                    </div>
                  </div>
                  
                  {isConfirmed && (
                    <div className="mt-6">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">{t.change_reason} <span className="text-rose-500">*</span></label>
                      <textarea 
                        className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-cyan-500/10 focus:bg-white transition-all h-24"
                        placeholder={t.issuance_reason_placeholder}
                        value={changeReason}
                        onChange={(e) => setChangeReason(e.target.value)}
                        required
                      ></textarea>
                    </div>
                  )}
                  
                  <div className="mt-6">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">{t.admin_note}</label>
                    <textarea 
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-cyan-500/10 focus:bg-white transition-all h-24"
                      placeholder={t.admin_note_placeholder}
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                    ></textarea>
                  </div>
                </div>
              </div>

              {isConfirmed && (
                <div className="p-6 rounded-3xl bg-amber-50 border border-amber-100 flex gap-4">
                   <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
                   <div>
                      <p className="text-sm font-bold text-amber-800 mb-1">{t.safety_confirmation}</p>
                      <p className="text-xs text-amber-700 leading-relaxed mb-4">
                        {t.change_impact} <span className="font-black">{delta >= 0 ? `+${delta}` : delta}</span>. {t.safety_confirmation_desc}
                      </p>
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                         <input 
                           type="checkbox" 
                           className="w-5 h-5 rounded-lg border-amber-300 text-amber-600 focus:ring-amber-500"
                           checked={isFinalConfirmationChecked}
                           onChange={(e) => setIsFinalConfirmationChecked(e.target.checked)}
                          />
                         <span className="text-sm font-bold text-amber-800">{t.confirm_verify_issuance}</span>
                      </label>
                   </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-4">
               <button onClick={() => setStep(2)} className="px-8 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all">{t.back_to_edit}</button>
               <button 
                disabled={isConfirmed ? (!isFinalConfirmationChecked || !changeReason) : false}
                onClick={handleConfirm}
                className="px-12 py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-xl shadow-emerald-600/20 disabled:opacity-50 hover:bg-emerald-700 transition-all"
               >
                 {t.save}
               </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditOrderWorkflow;
