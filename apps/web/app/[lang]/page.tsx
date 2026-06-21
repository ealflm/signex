import { notFound } from "next/navigation";
import { hasLocale } from "@/app/lib/i18n-config";
import { getSiteContent } from "@/app/lib/content";
import { Hero } from "@/app/components/home/hero";
import { Features } from "@/app/components/home/features";
import { ProductCategories } from "@/app/components/home/product-categories";
import { HomeAbout } from "@/app/components/home/home-about";
import { Contact } from "@/app/components/home/contact";

export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound(); // also narrows `lang` to Locale for getSiteContent
  const dict = await getSiteContent(lang);

  return (
    <>
      <Hero dict={dict} />
      <div className="home-a_rest-content">
        <Features dict={dict.features} />
        <ProductCategories dict={dict.products} />
        <HomeAbout dict={dict.about} />
        <Contact dict={dict} />
      </div>
    </>
  );
}
