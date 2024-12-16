import {
  Alert,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { scale, verticalScale } from "react-native-size-matters";
import AntDesign from "@expo/vector-icons/AntDesign";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Audio } from "expo-av";
import axios from "axios";
import LottieView from "lottie-react-native";
import * as Speech from "expo-speech";
import Regenerate from "@/assets/svgs/regenerate";
import Reload from "@/assets/svgs/reload";
import Constants from "expo-constants";

const HomeScreen = () => {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording>();
  const [AIResponse, setAIResponse] = useState(false);
  const [AISpeaking, setAISpeaking] = useState(false);
  const lottieRef = useRef<LottieView>(null);

  const OPENAI_API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_OPENAI_API_KEY;

  const getMicrophonePermission = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert("Permission", "Please grant permission to access the microphone.");
        return false;
      }
      return true;
    } catch (error) {
      console.error("Microphone permission error:", error);
      Alert.alert("Error", "Failed to get microphone permission.");
      return false;
    }
  };

  const startRecording = async () => {
    if (!OPENAI_API_KEY) {
      Alert.alert("Configuration Error", "OpenAI API Key is missing.");
      return;
    }

    const hasPermission = await getMicrophonePermission();
    if (!hasPermission) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      setIsRecording(true);
      const { recording } = await Audio.Recording.createAsync({
        android: { extension: ".wav", sampleRate: 44100 },
        ios: { extension: ".wav", sampleRate: 44100 },
      });
      setRecording(recording);
    } catch (error) {
      console.error("Failed to start recording:", error);
      Alert.alert("Error", "Failed to start recording.");
    }
  };

  const stopRecording = async () => {
    try {
      setIsRecording(false);
      setLoading(true);

      await recording?.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      const uri = recording?.getURI();
      if (!uri) throw new Error("No recording URI found.");

      const transcript = await sendAudioToWhisper(uri);
      if (transcript) {
        setText(transcript);
        await sendToGpt(transcript);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error("Failed to stop recording:", error);
      Alert.alert("Error", "Failed to process recording.");
      setLoading(false);
    }
  };

  const sendAudioToWhisper = async (uri: string, retries = 3) => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  
    const globalDelay = 500; 
    await delay(globalDelay);
  
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const formData = new FormData();
        formData.append("file", {
          uri,
          type: "audio/wav",
          name: "recording.wav",
        });
        formData.append("model", "whisper-1");
  
        const response = await axios.post(
          "https://api.openai.com/v1/audio/transcriptions",
          formData,
          {
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "multipart/form-data",
            },
          }
        );
  
        return response.data.text;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          if (attempt === retries) {
            Alert.alert(
              "Rate Limit Reached",
              "Too many requests. Please wait a moment and try again."
            );
            break;
          }
  
          const backoffTime = Math.pow(2, attempt) * 1000; 
          console.warn(`Rate limit reached. Retrying in ${backoffTime / 1000} seconds...`);
          await delay(backoffTime);
        } else {
          console.error("Whisper API Error:", error);
          Alert.alert("Error", "Failed to transcribe audio.");
          break;
        }
      }
    }
    return null; 
  };


  const sendToGpt = async (inputText: string) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
        setLoading(false);
        Alert.alert("Timeout", "The server took too long to respond.");
      }, 10000); 
  
      const globalDelay = 500; 
      await new Promise((resolve) => setTimeout(resolve, globalDelay));
  
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: "You are a friendly AI assistant. Respond in English.",
            },
            {
              role: "user",
              content: inputText,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
  
      const aiResponse = response.data.choices[0].message.content;
      setText(aiResponse);
      setAIResponse(true);
      setLoading(false);
      await speakText(aiResponse);
    } catch (error) {
      console.error("Error sending text to GPT:", error);
      setLoading(false);
      Alert.alert("Error", "Failed to get AI response.");
    }
  };
    
  const speakText = (text: string) => {
    setAISpeaking(true);
    Speech.speak(text, {
      onDone: () => setAISpeaking(false),
    });
  };

  return (
    <LinearGradient
      colors={["#250152", "#000"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <StatusBar barStyle={"light-content"} />

      <Image
        source={require("@/assets/main/blur.png")}
        style={{
          position: "absolute",
          right: scale(-15),
          top: 0,
          width: scale(240),
        }}
      />
      <Image
        source={require("@/assets/main/purple-blur.png")}
        style={{
          position: "absolute",
          left: scale(-15),
          bottom: verticalScale(100),
          width: scale(210),
        }}
      />

      {AIResponse && (
        <TouchableOpacity
          style={{
            position: "absolute",
            top: verticalScale(50),
            left: scale(20),
          }}
          onPress={() => {
            setIsRecording(false);
            setAIResponse(false);
            setText("");
          }}
        >
          <AntDesign name="arrowleft" size={scale(20)} color="#fff" />
        </TouchableOpacity>
      )}

      <View style={{ marginTop: verticalScale(-40) }}>
        {loading ? (
          <TouchableOpacity>
            <LottieView
              source={require("@/assets/animations/loading.json")}
              autoPlay
              loop
              speed={1.3}
              style={{ width: scale(270), height: scale(270) }}
            />
          </TouchableOpacity>
        ) : (
          <>
            {!isRecording ? (
              <>
                {AIResponse ? (
                  <View>
                    <LottieView
                      ref={lottieRef}
                      source={require("@/assets/animations/ai-speaking.json")}
                      autoPlay={false}
                      loop={false}
                      style={{ width: scale(250), height: scale(250) }}
                    />
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{
                      width: scale(110),
                      height: scale(110),
                      backgroundColor: "#fff",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: scale(100),
                    }}
                    onPress={startRecording}
                  >
                    <FontAwesome
                      name="microphone"
                      size={scale(50)}
                      color="#2b3356"
                    />
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <TouchableOpacity onPress={stopRecording}>
                <LottieView
                  source={require("@/assets/animations/animation.json")}
                  autoPlay
                  loop
                  speed={1.3}
                  style={{ width: scale(250), height: scale(250) }}
                />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
      <View
        style={{
          alignItems: "center",
          width: scale(350),
          position: "absolute",
          bottom: verticalScale(90),
        }}
      >
        <Text
          style={{
            color: "#fff",
            fontSize: scale(16),
            width: scale(269),
            textAlign: "center",
            lineHeight: 25,
          }}
        >
          {loading ? "..." : text || "Press the microphone to start recording!"}
        </Text>
      </View>
      {AIResponse && (
        <View
          style={{
            position: "absolute",
            bottom: verticalScale(40),
            left: 0,
            paddingHorizontal: scale(30),
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            width: scale(360),
          }}
        >
          <TouchableOpacity onPress={() => sendToGpt(text)}>
            <Regenerate />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => speakText(text)}>
            <Reload />
          </TouchableOpacity>
        </View>
      )}
    </LinearGradient>
  );
}

export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#131313",
  },
});
