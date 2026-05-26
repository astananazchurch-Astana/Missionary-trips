import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Compass,
  HandHeart,
  HeartHandshake,
  MapPin,
  MessageCircleHeart,
  Phone,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

export const church = {
  name: "Церковь Назарянина Астана",
  legalName:
    'Местное религиозное объединение "Евангельская Церковь Назарянина" города Астана',
  tagline: "Церковь как семья, преображенная Благой вестью и влияющая на мир",
  address: "ул. Нуртаса Ондасынова, 8, микрорайон Шубар, район Есиль, Астана",
  phone: "+7 (701) 526 - 06 - 34",
  workingHours: "Пн-Пт 10:00-16:30",
  bin: "960740000549",
  founded: "16.07.1996",
  leader: "Кван Сергей",
  mapUrl:
    "https://www.google.com/maps?q=%D1%83%D0%BB.%20%D0%9D%D1%83%D1%80%D1%82%D0%B0%D1%81%D0%B0%20%D0%9E%D0%BD%D0%B4%D0%B0%D1%81%D1%8B%D0%BD%D0%BE%D0%B2%D0%B0%2C%208%2C%20%D0%90%D1%81%D1%82%D0%B0%D0%BD%D0%B0&output=embed",
  mapLink:
    "https://www.google.com/maps/search/?api=1&query=%D1%83%D0%BB.%20%D0%9D%D1%83%D1%80%D1%82%D0%B0%D1%81%D0%B0%20%D0%9E%D0%BD%D0%B4%D0%B0%D1%81%D1%8B%D0%BD%D0%BE%D0%B2%D0%B0%2C%208%2C%20%D0%90%D1%81%D1%82%D0%B0%D0%BD%D0%B0",
  heroImage:
    "https://commons.wikimedia.org/wiki/Special:FilePath/City_Gate%2C_Astana%2C_Skyline_of_Nur_Sultan.jpg?width=1800",
  imageCredit: "Nikolamikovic82 / Wikimedia Commons, CC0",
};

export const navLinks = [
  { label: "О церкви", href: "#about" },
  { label: "Миссия", href: "#mission" },
  { label: "Служения", href: "#ministries" },
  { label: "Поездки", href: "#trips" },
  { label: "Контакты", href: "#contacts" },
];

export type IconCard = {
  icon: LucideIcon;
  title: string;
  text: string;
};

export const facts: IconCard[] = [
  {
    icon: MapPin,
    title: "Адрес",
    text: church.address,
  },
  {
    icon: CalendarDays,
    title: "Время работы",
    text: church.workingHours,
  },
  {
    icon: ShieldCheck,
    title: "Регистрация",
    text: `БИН ${church.bin}, с ${church.founded}`,
  },
];

export const missionValues: IconCard[] = [
  {
    icon: BookOpen,
    title: "Слово",
    text: "Изучаем Писание и растем в вере через проповедь, малые группы и личное ученичество.",
  },
  {
    icon: HeartHandshake,
    title: "Община",
    text: "Строим теплое пространство, где семьи, молодежь и гости могут быть услышаны и поддержаны.",
  },
  {
    icon: HandHeart,
    title: "Милосердие",
    text: "Служим людям рядом с нами через заботу, практическую помощь и молитвенную поддержку.",
  },
];

export const ministries: IconCard[] = [
  {
    icon: UsersRound,
    title: "Воскресные встречи",
    text: "Поклонение, проповедь, молитва и общение для всех, кто ищет Бога и живую церковную семью.",
  },
  {
    icon: MessageCircleHeart,
    title: "Малые группы",
    text: "Домашние и тематические встречи для общения, наставничества и совместного чтения Библии.",
  },
  {
    icon: Sparkles,
    title: "Молодежь и дети",
    text: "Безопасная среда для роста, дружбы и участия в добрых проектах города.",
  },
  {
    icon: Compass,
    title: "Миссионерские поездки",
    text: "Молитвенная подготовка, сбор команды и поездки туда, где люди нуждаются в поддержке, заботе и живом свидетельстве о Христе.",
  },
];

export const tripHighlights = [
  {
    icon: CheckCircle2,
    text: "заявки участников и анкеты",
  },
  {
    icon: CheckCircle2,
    text: "команды, роли и подготовка",
  },
  {
    icon: CheckCircle2,
    text: "календарь поездок и служений",
  },
  {
    icon: CheckCircle2,
    text: "отчеты, фото и молитвенные нужды",
  },
];

export const contacts = [
  {
    icon: MapPin,
    label: "Адрес",
    value: church.address,
  },
  {
    icon: Phone,
    label: "Телефон",
    value: church.phone,
  },
  {
    icon: CalendarDays,
    label: "График",
    value: church.workingHours,
  },
];

export const sources = [
  {
    label: "Бизнес Аналитик / eGov",
    href: "https://ba.prg.kz/710000000-astana/960740000549-mestnoe-religioznoe-obyedinenie-evangelskaya-tserkov-nazaryanina-goroda-astana/",
  },
  {
    label: "JSPRAV",
    href: "https://astana.jsprav.ru/pravoslavnyie-hramyi/tserkov-nazarianina/",
  },
  {
    label: "Church of the Nazarene",
    href: "https://nazarene.org/",
  },
  {
    label: "Eurasia Region",
    href: "https://www.eurasiaregion.org/",
  },
];
