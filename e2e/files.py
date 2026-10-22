def pdf(lines):
    esc = lambda s: s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = "BT /F1 10 Tf 50 750 Td 14 TL\n" + "".join(f"({esc(l)}) Tj T*\n" for l in lines) + "ET"
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            f"<< /Length {len(stream.encode('latin-1'))} >>\nstream\n{stream}\nendstream",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]
    out = "%PDF-1.4\n"; offs = []
    for i, o in enumerate(objs):
        offs.append(len(out.encode('latin-1'))); out += f"{i+1} 0 obj\n{o}\nendobj\n"
    x = len(out.encode('latin-1'))
    out += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offs)
    out += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n"
    return out.encode('latin-1')

def certificate():
    return pdf(["CERTIFICADO DE INGRESOS Y RETENCIONES POR RENTAS DE TRABAJO Y DE PENSIONES",
                "Formulario 220 - Año gravable 2025 (documento SINTETICO de prueba)",
                "Total de ingresos brutos                                   120.000.000",
                "Aportes obligatorios por salud a cargo del trabajador      4.800.000",
                "Aportes obligatorios a fondos de pensiones                 4.800.000",
                "Valor de la retención en la fuente por ingresos laborales  5.000.000"])
