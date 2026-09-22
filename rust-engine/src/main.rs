tokio::spawn(async move {
        let body = serde_json::json!({
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": payload.prompt}],
            "stream": true
        });

        let res = client
            .post("https://api.openai.com/v1/chat/completions")
            .bearer_auth(api_key)
            .json(&body)
            .send()
            .await;

        match res {
            Ok(response) => {
                let status = response.status();
                if !status.is_success() {
                    let error_text = response.text().await.unwrap_or_default();
                    eprintln!("❌ OpenAI API Error [{}]: {}", status, error_text);
                    let _ = tx.send(Ok(Event::default().data(format!("OpenAI Error: {}", status)))).await;
                    return;
                }

                let mut stream = response.bytes_stream();
                while let Some(chunk_result) = stream.next().await {
                    match chunk_result {
                        Ok(bytes) => {
                            if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                                for line in text.lines() {
                                    if line.starts_with("data: ") {
                                        let data = &line[6..];
                                        if data != "[DONE]" {
                                            let _ = tx.send(Ok(Event::default().data(data))).await;
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("❌ Stream chunk error: {:?}", e);
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("❌ Failed to connect to OpenAI: {:?}", e);
                let _ = tx.send(Ok(Event::default().data("Error connecting to OpenAI"))).await;
            }
        }
<<<<<<< HEAD
    });
    });
>>>>>>> 09562abf6a5dd20287dc2d90937bcf465fa55438
