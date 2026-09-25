use std::collections::HashMap;
use serde_json::Value;

static LOCALES: std::sync::LazyLock<HashMap<&'static str, Value>> =
    std::sync::LazyLock::new(|| {
        let locale_files = [
            ("en", include_str!("../../../src/locales/en.json")),
            ("zh-cn", include_str!("../../../src/locales/zh-CN.json")),
        ];

        locale_files
            .into_iter()
            .map(|(locale, content)| {
                let trimmed = content.trim_start_matches('\u{feff}');
                let parsed = serde_json::from_str::<Value>(trimmed)
                    .unwrap_or_else(|err| panic!("解析语言文件失败 {}: {}", locale, err));
                (locale, parsed)
            })
            .collect()
    });

fn normalize_locale(locale: &str) -> String {
    locale.trim().replace('_', "-").to_lowercase()
}

fn locale_candidates(locale: &str) -> Vec<String> {
    let normalized = normalize_locale(locale);
    if normalized.is_empty() {
        return vec!["zh-cn".to_string(), "en".to_string()];
    }

    if normalized.starts_with("zh") {
        vec!["zh-cn".to_string(), "en".to_string()]
    } else {
        vec!["en".to_string(), "zh-cn".to_string()]
    }
}

fn lookup_key<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    let mut current = value;
    for segment in key.split('.') {
        current = current.get(segment)?;
    }
    current.as_str()
}

pub fn translate(locale: &str, key: &str, replacements: &[(&str, &str)]) -> String {
    let template = locale_candidates(locale)
        .into_iter()
        .find_map(|candidate| {
            LOCALES
                .get(candidate.as_str())
                .and_then(|value| lookup_key(value, key))
        })
        .unwrap_or(key);

    let mut output = template.to_string();
    for (name, value) in replacements {
        output = output.replace(&format!("{{{{{}}}}}", name), value);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::translate;

    #[test]
    fn uses_selected_locale() {
        assert_eq!(
            translate("zh-cn", "quotaAlert.modal.title", &[]),
            "配额预警"
        );
        assert_eq!(
            translate("en", "quotaAlert.modal.title", &[]),
            "Quota Alert"
        );
    }

    #[test]
    fn falls_back_to_base_locale() {
        assert_eq!(
            translate("en-us", "quotaAlert.modal.title", &[]),
            "Quota Alert"
        );
    }

    #[test]
    fn interpolates_placeholders() {
        let text = translate(
            "en",
            "quotaAlert.bannerText",
            &[
                ("email", "demo@example.com"),
                ("threshold", "20"),
                ("lowest", "12"),
                ("models", "claude-sonnet-4"),
            ],
        );

        assert_eq!(
            text,
            "Quota alert for demo@example.com (threshold 20%, lowest 12%, models: claude-sonnet-4)"
        );
    }
}
