import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { useNavigate, useParams } from "react-router";
import { useLanguage } from "../contexts/LanguageContext";

type LegalType = "terms" | "privacy" | "licenses";

const content: Record<LegalType, Record<"RU" | "UZ", { title: string; body: string[] }>> = {
  terms: {
    RU: {
      title: "Условия использования",
      body: [
        "Настоящие Условия использования регулируют использование программы лояльности IRIZON.",
        "1. Участие в программе\nУчастие в программе лояльности IRIZON открыто для механиков и дистрибьюторов автомобильных свечей зажигания, зарегистрированных компанией IRIZON.",
        "2. Начисление баллов\nБаллы начисляются за покупку продукции IRIZON путём сканирования QR-кодов на упаковке. Один балл равен одной единице продукции.",
        "3. Использование баллов\nНакопленные баллы можно обменять на подарки из каталога программы лояльности. Обмен баллов на денежные средства не предусмотрен.",
        "4. Срок действия баллов\nБаллы действительны в течение срока участия в программе. Компания IRIZON оставляет за собой право изменять условия программы.",
        "5. Ответственность\nКомпания IRIZON не несёт ответственности за технические сбои, которые могут повлиять на начисление или списание баллов.",
        "По вопросам обращайтесь: info@irizon.uz или +998 95 279 3333.",
      ],
    },
    UZ: {
      title: "Foydalanish shartlari",
      body: [
        "Ushbu Foydalanish shartlari IRIZON sodiqlik dasturidan foydalanishni tartibga soladi.",
        "1. Dasturga ishtirok etish\nIRIZON sodiqlik dasturida ishtirok etish IRIZON tomonidan ro'yxatga olingan avtomobil sham mexaniklari va distribyutorlari uchun ochiq.",
        "2. Ballarni to'plash\nBallar IRIZON mahsulotlarini sotib olish va qadoqdagi QR-kodlarni skanerlash orqali to'planadi. Bir ball bir birlik mahsulotga teng.",
        "3. Ballardan foydalanish\nTo'plangan ballarni sodiqlik dasturi katalogidagi sovg'alarga almashtirish mumkin. Ballarni naqd pulga almashtirish ko'zda tutilmagan.",
        "4. Ballarning amal qilish muddati\nBallar dasturda ishtirok etish davomida amal qiladi. IRIZON kompaniyasi dastur shartlarini o'zgartirish huquqini o'zida saqlab qoladi.",
        "5. Mas'uliyat\nIRIZON kompaniyasi ballarni hisoblash yoki yechishga ta'sir qilishi mumkin bo'lgan texnik nosozliklar uchun javobgar emas.",
        "Murojaat uchun: info@irizon.uz yoki +998 95 279 3333.",
      ],
    },
  },
  privacy: {
    RU: {
      title: "Политика конфиденциальности",
      body: [
        "Настоящая Политика конфиденциальности описывает, как IRIZON собирает, использует и защищает ваши личные данные.",
        "1. Собираемые данные\nМы собираем: номер телефона, историю транзакций и баллов, данные об использовании приложения.",
        "2. Использование данных\nДанные используются исключительно для работы программы лояльности: начисления баллов, обработки заявок на подарки и поддержки пользователей.",
        "3. Защита данных\nМы применяем технические и организационные меры для защиты ваших данных от несанкционированного доступа.",
        "4. Передача третьим лицам\nМы не передаём ваши данные третьим лицам без вашего согласия, за исключением случаев, предусмотренных законодательством.",
        "5. Ваши права\nВы вправе запросить доступ к своим данным, их исправление или удаление. Для этого свяжитесь с нами по адресу info@irizon.uz.",
        "6. Контакты\nПо вопросам конфиденциальности: info@irizon.uz или +998 95 279 3333.",
      ],
    },
    UZ: {
      title: "Maxfiylik siyosati",
      body: [
        "Ushbu Maxfiylik siyosati IRIZON shaxsiy ma'lumotlaringizni qanday yig'ishi, ishlatishi va himoya qilishini tavsiflaydi.",
        "1. To'planadigan ma'lumotlar\nBiz quyidagilarni to'laymiz: telefon raqami, tranzaksiyalar va ballar tarixi, ilovadan foydalanish ma'lumotlari.",
        "2. Ma'lumotlardan foydalanish\nMa'lumotlar faqat sodiqlik dasturining ishlashi uchun ishlatiladi: ballarni hisoblash, sovg'a arizalarini ko'rib chiqish va foydalanuvchilarga yordam berish.",
        "3. Ma'lumotlarni himoya qilish\nMa'lumotlaringizni ruxsatsiz kirishdan himoya qilish uchun texnik va tashkiliy choralar ko'ramiz.",
        "4. Uchinchi shaxslarga uzatish\nBiz sizning ma'lumotlaringizni qonun hujjatlarida nazarda tutilgan hollar bundan mustasno, roziligingizni olmasdan uchinchi shaxslarga bermaymiz.",
        "5. Sizning huquqlaringiz\nSiz ma'lumotlaringizga kirish, ularni to'g'rilash yoki o'chirish huquqiga egasiz. Buning uchun info@irizon.uz orqali biz bilan bog'laning.",
        "6. Aloqa\nMaxfiylik masalalari bo'yicha: info@irizon.uz yoki +998 95 279 3333.",
      ],
    },
  },
  licenses: {
    RU: {
      title: "Лицензии",
      body: [
        "Приложение IRIZON Loyalty использует следующие открытые библиотеки и компоненты:",
        "React — MIT License\nCopyright (c) Meta Platforms, Inc. and affiliates.",
        "React Router — MIT License\nCopyright (c) Remix Software Inc.",
        "Framer Motion — MIT License\nCopyright (c) Framer B.V.",
        "Tailwind CSS — MIT License\nCopyright (c) Tailwind Labs, Inc.",
        "Lucide React — ISC License\nCopyright (c) Lucide Contributors.",
        "Capacitor — MIT License\nCopyright (c) Ionic.",
        "Все перечисленные библиотеки распространяются на условиях соответствующих открытых лицензий. Тексты лицензий доступны по запросу.",
      ],
    },
    UZ: {
      title: "Litsenziyalar",
      body: [
        "IRIZON Loyalty ilovasi quyidagi ochiq kutubxonalar va komponentlardan foydalanadi:",
        "React — MIT License\nCopyright (c) Meta Platforms, Inc. and affiliates.",
        "React Router — MIT License\nCopyright (c) Remix Software Inc.",
        "Framer Motion — MIT License\nCopyright (c) Framer B.V.",
        "Tailwind CSS — MIT License\nCopyright (c) Tailwind Labs, Inc.",
        "Lucide React — ISC License\nCopyright (c) Lucide Contributors.",
        "Capacitor — MIT License\nCopyright (c) Ionic.",
        "Sanab o'tilgan barcha kutubxonalar tegishli ochiq litsenziyalar shartlari asosida tarqatiladi. Litsenziya matnlari so'rov bo'yicha mavjud.",
      ],
    },
  },
};

export function Legal() {
  const navigate = useNavigate();
  const { type } = useParams<{ type: LegalType }>();
  const { language } = useLanguage();

  const legalType = (type as LegalType) || "terms";
  const page = content[legalType]?.[language] ?? content.terms[language];

  return (
    <div className="min-h-screen bg-[#F5F7FB] pb-8">
      <div className="bg-gradient-to-br from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] px-5 pt-6 pb-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "24px 24px" }}
          />
        </div>
        <div className="relative">
          <div className="flex items-center justify-between mb-6">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </motion.button>
            <div />
          </div>
          <h1 className="text-white font-semibold text-[22px]">{page.title}</h1>
        </div>
      </div>

      <div className="px-5">
        <div className="-mt-6 relative z-10">
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
            {page.body.map((paragraph, i) => (
              <p key={i} className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
