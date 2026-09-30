import { formatMoney, type CurrencyCode, type Money } from '@/domain/money';
import { formatIban } from '@/domain/validators';
import { formatDate, formatDateShort } from '@/ui/format';

export type ReminderTone = 'nazik' | 'resmi' | 'kararli';

export interface ReminderInput {
  ourCompany: string;
  contactName: string;
  currency: CurrencyCode;
  total: Money;
  maxDaysLate: number;
  documents: Array<{ number?: string; title: string; dueDate: string; remaining: Money }>;
  iban?: string;
  payBy: string;
}

function list(i: ReminderInput): string {
  return i.documents
    .map((d) => `• ${d.number ?? d.title} · vade ${formatDateShort(d.dueDate)} · ${formatMoney(d.remaining, i.currency)}`)
    .join('\n');
}

/** AI kapalıyken kullanılan, Türkçe ticari yazışma geleneğine uygun hazır şablonlar. */
export function reminderText(tone: ReminderTone, i: ReminderInput): { subject: string; body: string } {
  const total = formatMoney(i.total, i.currency);
  const bank = i.iban ? `\n\nHesap bilgilerimiz:\n${i.ourCompany}\n${formatIban(i.iban)}` : '';
  const count = i.documents.length;
  if (tone === 'nazik') {
    return {
      subject: `Vadesi geçen ödeme hatırlatması · ${i.ourCompany}`,
      body: `Merhaba,\n\n${i.ourCompany} olarak iyi çalışmalar dileriz. Kayıtlarımızda ${count > 1 ? `${count} faturanızın` : 'bir faturanızın'} vadesinin geçtiğini gördük; toplam tutar ${total}.\n\n${list(i)}\n\nÖdemeyi zaten planladıysanız bu mesajı dikkate almayın. Bir sorun varsa konuşmaktan memnuniyet duyarız.${bank}\n\nTeşekkür ederiz.`,
    };
  }
  if (tone === 'resmi') {
    return {
      subject: `Vadesi geçmiş bakiye hk. · ${i.contactName}`,
      body: `Sayın ${i.contactName} yetkilisi,\n\nKayıtlarımıza göre aşağıdaki ${count > 1 ? 'faturaların' : 'faturanın'} vadesi geçmiş olup toplam ${total} tutarında açık bakiye bulunmaktadır:\n\n${list(i)}\n\nSöz konusu tutarın en geç ${formatDate(i.payBy)} tarihine kadar hesabımıza ödenmesini rica ederiz. Ödemenin yapılmış olması halinde dekontun tarafımıza iletilmesini rica ederiz.${bank}\n\nSaygılarımızla,\n${i.ourCompany}`,
    };
  }
  return {
    subject: `Son hatırlatma: ${total} gecikmiş bakiye`,
    body: `Sayın ${i.contactName},\n\n${i.maxDaysLate} günü aşan gecikmeli bakiyeniz ${total} tutarındadır ve önceki hatırlatmalarımıza rağmen ödeme alınamamıştır.\n\n${list(i)}\n\n${formatDate(i.payBy)} tarihine kadar ödeme yapılmaması halinde yeni sevkiyatları durdurmak ve yasal takip sürecini başlatmak zorunda kalacağımızı bilgilerinize sunarız.${bank}\n\n${i.ourCompany}`,
  };
}

export function whatsappLink(phone: string | undefined, text: string): string {
  const digits = (phone ?? '').replace(/\D/g, '').replace(/^0/, '90');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(email: string | undefined, subject: string, body: string): string {
  return `mailto:${email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
